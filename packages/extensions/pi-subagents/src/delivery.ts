import type {
  AgentBeforeSettleEventResult,
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
  TurnEndEvent,
  TurnEndEventResult
} from "@earendil-works/pi-coding-agent";
import type { WorkingMessageHandle } from "@pi-mono/libs/working-message";

import type { ResultDelivery } from "./config.ts";
import { JOB_RESULT_MESSAGE, RESULT_MESSAGE } from "./constants.ts";
import { jobText } from "./jobs/records.ts";
import type { JobEvent, Jobs } from "./jobs/registry.ts";
import { taskResult } from "./result.ts";
import type { TaskEvent, Tasks } from "./tasks/registry.ts";

type Completion = Parameters<ExtensionAPI["sendMessage"]>[0];

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
function wakeIdle(pi: ExtensionAPI, [first, ...rest]: readonly Completion[]): void {
  if (!first) return;
  for (const message of rest) pi.sendMessage(message, { deliverAs: "nextTurn" });
  pi.sendMessage(first, { triggerTurn: true });
}

/**
 * Owns background completions of tasks and jobs until a turn end, the settlement, or the idle
 * handoff. Only background tasks hold a run; job results join the next handoff. See ADR 0001,
 * ADR 0005, and ADR 0006.
 */
export class Delivery {
  private pending: Completion[] = [];
  private waiting = false;
  private wake: (() => void) | undefined;
  private closed = false;
  /** A session change is pending: tasks stopped, and job results wait for the next run. */
  private suspended = false;
  /** Pi emits no event when a manual compaction ends; results queued during one recheck. */
  private recheck: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: () => void;
  private unsubscribeJobs: () => void;

  constructor(
    private tasks: Tasks,
    jobs: Jobs,
    private pi: ExtensionAPI,
    private ctx: ExtensionContext,
    private depth: number,
    private message: WorkingMessageHandle,
    private resultDelivery: ResultDelivery
  ) {
    this.unsubscribe = tasks.subscribe((event) => this.completed(event));
    this.unsubscribeJobs = jobs.subscribe((event) => this.jobCompleted(event));
  }

  private jobCompleted(event: JobEvent): void {
    if (this.closed || event.kind !== "completed" || event.dropped) return;
    const { details } = event;
    this.queue({
      customType: JOB_RESULT_MESSAGE,
      display: true,
      content: [
        {
          type: "text",
          text: jobText(
            details,
            event.text,
            `Background job ${details.outcome}: ${details.description}`
          )
        }
      ],
      details
    });
  }

  private completed(event: TaskEvent): void {
    if (this.closed || event.kind !== "completed") return;

    if (!event.details.background || event.dropped) {
      // A dropped completion still changes the number of remaining tasks.
      this.wake?.();

      return;
    }

    const result = taskResult(
      event.details,
      event.text,
      undefined,
      `Background task ${event.outcome}: ${event.details.description}`
    );
    this.queue({
      customType: RESULT_MESSAGE,
      display: true,
      content: result.content,
      // `late_usage` becomes a hidden usage entry when Pi persists this message.
      details: { ...result.details, ...(event.lateUsage ? { late_usage: event.lateUsage } : {}) }
    });
  }

  private queue(message: Completion): void {
    this.pending.push(message);

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

  private take(): Completion[] {
    const pending = this.pending;
    this.pending = [];

    return pending;
  }

  /** Waits for the first background result, new input, an abort, or no remaining tasks. */
  private async next(signal?: AbortSignal): Promise<WaitResult> {
    for (;;) {
      if (this.closed) return "closed";
      if (signal?.aborted) return "abort";
      if (this.pending.length) return "result";
      if (!this.hasBackground()) return "none";
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
  async end(event: AgentEndEvent, ctx: ExtensionContext): Promise<void> {
    if (this.closed) return;
    const last = [...event.messages].reverse().find((message) => message.role === "assistant");
    if (!isNormalReply(last)) return;
    this.waiting = true;
    // Pi keeps the TUI loader until `agent_end` handlers finish; the coordinator writes only in TUI mode.
    if (this.hasBackground()) this.message.setText(WAITING_MESSAGE);

    try {
      // Keep results pending: a follow-up queued here can be stranded by a later abort.
      await this.next(ctx.signal);
    } finally {
      this.waiting = false;
      this.message.setText();
    }
  }

  /** A direct task runs in the background; descendants report to their own supervisors. */
  private hasBackground(): boolean {
    // Stopped tasks keep their last records.
    if (!this.tasks.activeBinding) return false;

    return this.tasks.direct().some((record) => record.state === "active" && record.background);
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
  settled(ctx: ExtensionContext): void {
    if (!this.ready() || !ctx.isIdle()) return;
    wakeIdle(this.pi, this.take());
  }

  /**
   * Before a session change: drop task results and stop waiting for tasks. Job results stay
   * pending without starting a turn, because a later extension can still cancel the change.
   */
  suspend(): void {
    this.suspended = true;
    this.unsubscribe();
    this.pending = this.pending.filter((message) => message.customType !== RESULT_MESSAGE);
    this.stopRecheck();
    this.wake?.();
  }

  /** Resumes delivery of pending job results in a run after a cancelled session change. */
  resume(): void {
    this.suspended = false;
  }

  shutdown(): void {
    this.closed = true;
    this.unsubscribe();
    this.unsubscribeJobs();
    this.pending = [];
    this.stopRecheck();
    this.wake?.();
  }
}
