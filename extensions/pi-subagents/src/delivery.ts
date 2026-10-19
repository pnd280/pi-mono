import type {
  AgentBeforeSettleEventResult,
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
  TurnEndEvent,
  TurnEndEventResult
} from "@earendil-works/pi-coding-agent";
import type { WorkingMessageHandle } from "@pi-mono/libs/working-message";

import type { ResultEvent, ResultMessage, ResultSource } from "./background-result.ts";
import type { ResultDelivery } from "./config.ts";

/** A result that delivery holds until Pi can take it. */
type Pending = Extract<ResultEvent, { kind: "result" }>;

type WaitResult = "closed" | "result" | "none" | "input" | "abort";

/** Working-message text while the supervisor waits for background tasks. */
const WAITING_MESSAGE = "Waiting for background subagents";

/** New input arrives through Pi's queue, which has no event; poll it at this interval. */
const INPUT_POLL_MS = 250;

/** Pi retries or recovers other replies first: failed, aborted, and length-truncated ones. */
function isNormalReply(message: TurnEndEvent["message"] | undefined): boolean {
  return (
    message?.role === "assistant" &&
    (message.stopReason === "stop" || message.stopReason === "toolUse")
  );
}

/**
 * Starts one prepared turn on an idle supervisor for all ready background results.
 *
 * The first result starts the run through `before_agent_start`, and Pi adds pending `nextTurn`
 * messages after it. Queue the others first, in the same synchronous block, so that no other run
 * takes them.
 */
function wakeIdle(
  pi: Pick<ExtensionAPI, "sendMessage">,
  [first, ...rest]: readonly ResultMessage[]
): void {
  if (!first) return;
  for (const message of rest) pi.sendMessage(message, { deliverAs: "nextTurn" });
  pi.sendMessage(first, { triggerTurn: true });
}

/**
 * Owns the finished background results of its sources until a turn end, the settlement, or the
 * idle handoff. A wait lasts while a source holds the run; results that do not hold it join the
 * next handoff. See ADR 0001, ADR 0005, and ADR 0006.
 */
export class Delivery {
  private pending: Pending[] = [];
  private waiting = false;
  private wake: (() => void) | undefined;
  private closed = false;
  /** A session change is pending or was cancelled: results wait without a turn until a run starts. */
  private suspended = false;
  /** Pi emits no event when a manual compaction ends; results queued during one recheck. */
  private recheck: ReturnType<typeof setInterval> | undefined;
  private sources = new Map<ResultSource, () => void>();

  constructor(
    private pi: Pick<ExtensionAPI, "sendMessage">,
    private ctx: Pick<ExtensionContext, "isIdle" | "hasPendingMessages" | "mode">,
    private depth: number,
    private message: WorkingMessageHandle,
    private resultDelivery: ResultDelivery
  ) {}

  /** Takes the results of `source` until the returned function or `shutdown` removes it. */
  add(source: ResultSource): () => void {
    this.sources.set(
      source,
      source.subscribe((event) => this.receive(event))
    );

    return () => {
      this.sources.get(source)?.();
      this.sources.delete(source);
    };
  }

  private receive(event: ResultEvent): void {
    if (this.closed) return;
    // The work that holds the run changed, so a wait checks it again.
    if (event.kind === "changed") return this.wake?.();
    this.pending.push(event);

    if (this.waiting) {
      this.wake?.();

      return;
    }

    this.handoff();
  }

  /**
   * Starts a turn for pending results on an idle supervisor. Busy results stay owned here until Pi
   * can commit them, the aborted run settles, or Pi becomes idle without a run.
   */
  private handoff(): void {
    if (!this.ready()) return this.stopRecheck();
    if (this.waiting) return;

    if (this.ctx.isIdle()) {
      this.stopRecheck();
      wakeIdle(this.pi, this.take());

      return;
    }

    this.recheck ??= setInterval(() => this.handoff(), INPUT_POLL_MS);
    this.recheck.unref();
  }

  private stopRecheck(): void {
    clearInterval(this.recheck);
    this.recheck = undefined;
  }

  /** Pending results can go to Pi: delivery is open and no session change is pending. */
  private ready(): boolean {
    return !this.closed && !this.suspended && this.pending.length > 0;
  }

  private take(): ResultMessage[] {
    const pending = this.pending;
    this.pending = [];

    return pending.map((result) => result.message);
  }

  /** Waits for the first background result, new input, an abort, or no remaining tasks. */
  private async next(signal?: AbortSignal): Promise<WaitResult> {
    for (;;) {
      if (this.closed) return "closed";
      if (signal?.aborted) return "abort";
      if (this.pending.length) return "result";
      if (!this.holdsRun()) return "none";
      if (this.ctx.hasPendingMessages()) return "input";

      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", done);
          this.wake = undefined;
          resolve();
        };

        const timer = setTimeout(done, INPUT_POLL_MS);
        signal?.addEventListener("abort", done, { once: true });
        this.wake = done;
      });
    }
  }

  /**
   * With `turn_end` delivery, commits ready results after a normal turn, so the model's next
   * request includes them. Results that arrive after the final turn wait for `end` and `settle`.
   */
  turn(event: TurnEndEvent): TurnEndEventResult | undefined {
    if (this.resultDelivery !== "turn_end" || !this.ready() || !isNormalReply(event.message))
      return;

    // Pi flushes these into the transcript after the turn_end handlers, before the next request.
    for (const message of this.take()) this.pi.sendMessage(message, { triggerTurn: false });

    // Ask for another response; tools or queued input can already require it.
    return { continue: true };
  }

  /** Keeps the supervisor busy until its first background result, so the result continues this run. */
  async end(event: AgentEndEvent, ctx: Pick<ExtensionContext, "signal">): Promise<void> {
    if (this.closed) return;
    const last = [...event.messages].reverse().find((message) => message.role === "assistant");
    if (!isNormalReply(last)) return;
    this.waiting = true;
    // Pi keeps the TUI loader until `agent_end` handlers finish; the coordinator writes only in TUI mode.
    if (this.holdsRun()) this.message.setText(WAITING_MESSAGE);

    try {
      // Keep results pending: a follow-up queued here can be stranded by a later abort.
      await this.next(ctx.signal);
    } finally {
      this.waiting = false;
      this.message.setText();
    }
  }

  /** A source's unfinished result holds the run: a direct background task, not a job. */
  private holdsRun(): boolean {
    return [...this.sources.keys()].some((source) => source.holdsRun());
  }

  /** Commits ready results in all modes; print, JSON, and nested supervisors can also wait. */
  async settle(): Promise<AgentBeforeSettleEventResult | undefined> {
    if (
      this.closed ||
      this.suspended ||
      (!this.pending.length &&
        this.depth === 0 &&
        this.ctx.mode !== "print" &&
        this.ctx.mode !== "json")
    )
      return;
    this.waiting = true;

    try {
      // Pi has no abort signal at this point. A session change can begin during the wait.
      if ((await this.next()) !== "result" || !this.ready()) return;

      // Pi flushes these into the transcript before continuation or aborted settlement.
      for (const message of this.take()) this.pi.sendMessage(message, { triggerTurn: false });

      return { continue: true };
    } finally {
      this.waiting = false;
    }
  }

  /** Delivers results that arrived as a wait ended by an abort. */
  settled(ctx: Pick<ExtensionContext, "isIdle">): void {
    if (!this.ready() || !ctx.isIdle()) return;
    wakeIdle(this.pi, this.take());
  }

  /**
   * Before a session change: drop task results and stop waiting for tasks. Job results survive
   * the change and stay pending without starting a turn, because a later extension can still
   * cancel the change. Results that arrive later also wait.
   */
  suspend(): void {
    this.suspended = true;
    this.pending = this.pending.filter((result) => result.survivesChange);
    this.stopRecheck();
    this.wake?.();
  }

  /** In a run after a cancelled session change: the results that waited join this run. */
  resume(): void {
    this.suspended = false;
  }

  shutdown(): void {
    this.closed = true;
    for (const stop of this.sources.values()) stop();
    this.sources.clear();
    this.pending = [];
    this.stopRecheck();
    this.wake?.();
  }
}
