import type {
  AgentBeforeSettleEventResult,
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext
} from "@earendil-works/pi-coding-agent";
import type { WorkingMessageHandle } from "@pi-mono/libs/working-message";

import { RESULT_MESSAGE } from "./constants.ts";
import { taskResult } from "./result.ts";
import type { TaskEvent, Tasks } from "./tasks.ts";

type Completion = Parameters<ExtensionAPI["sendMessage"]>[0];

type WaitResult = "closed" | "result" | "none" | "input" | "abort";

/** Working-message text while the supervisor waits for background tasks. */
const WAITING_MESSAGE = "Waiting for background subagents";

/** New input arrives through Pi's queue, which has no event; poll it at this interval. */
const INPUT_POLL_MS = 250;

/**
 * Starts a turn on an idle supervisor with background results, and keeps Pi's prompt preparation.
 *
 * Workaround for [Pi issue 5581](https://github.com/earendil-works/pi/issues/5581), open in
 * Pi 1.0.2: an idle `sendMessage` with `triggerTurn` skips `before_agent_start`, so the turn
 * lacks the context that extensions prepare there. Queuing the results as `nextTurn` and then
 * sending a user message uses the prompt path, which runs the hook and adds the queued results
 * to the same turn. The transcript shows the extra user message. Make both calls in the same
 * synchronous block, so that no other prompt takes the queued results. When Pi fixes the issue,
 * use `sendMessage(message, { triggerTurn: true })`.
 */
function wakeIdle(pi: ExtensionAPI, messages: readonly Completion[]): void {
  for (const message of messages) pi.sendMessage(message, { deliverAs: "nextTurn" });
  pi.sendUserMessage("Background subagent finished.");
}

/** Owns background completions until the settlement or idle handoff. */
export class Delivery {
  private pending: Completion[] = [];
  private waiting = false;
  private wake: (() => void) | undefined;
  private closed = false;
  private unsubscribe: () => void;

  constructor(
    private tasks: Tasks,
    private pi: ExtensionAPI,
    private ctx: ExtensionContext,
    private depth: number,
    private message: WorkingMessageHandle
  ) {
    this.unsubscribe = tasks.subscribe((event) => this.completed(event));
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
    this.pending.push({
      customType: RESULT_MESSAGE,
      display: true,
      content: result.content,
      // `late_usage` becomes a hidden usage entry when Pi persists this message.
      details: { ...result.details, ...(event.lateUsage ? { late_usage: event.lateUsage } : {}) }
    });

    if (this.waiting) {
      this.wake?.();

      return;
    }

    // Busy results stay owned here until Pi can commit them or the aborted run settles.
    if (this.ctx.isIdle()) wakeIdle(this.pi, this.take());
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

  /** Keeps the supervisor busy until its first background result, so the result continues this run. */
  async end(event: AgentEndEvent, ctx: ExtensionContext): Promise<void> {
    if (this.closed) return;
    const last = [...event.messages].reverse().find((message) => message.role === "assistant");
    if (last?.role !== "assistant" || (last.stopReason !== "stop" && last.stopReason !== "toolUse"))
      return;
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
    const records = this.tasks.list();
    const ids = new Set(records.map((record) => record.task_id));

    return records.some(
      (record) =>
        record.state === "active" &&
        record.background &&
        (record.parent_task_id === null || !ids.has(record.parent_task_id))
    );
  }

  /** Commits ready results in all modes; print, JSON, and nested supervisors can also wait. */
  async settle(): Promise<AgentBeforeSettleEventResult | undefined> {
    if (
      this.closed ||
      (!this.pending.length &&
        this.depth === 0 &&
        this.ctx.mode !== "print" &&
        this.ctx.mode !== "json")
    )
      return;
    this.waiting = true;

    try {
      // Pi has no abort signal at this point.
      if ((await this.next()) !== "result") return;

      // Pi flushes these into the transcript before continuation or aborted settlement.
      for (const message of this.take()) this.pi.sendMessage(message, { triggerTurn: false });

      return { continue: true };
    } finally {
      this.waiting = false;
    }
  }

  /** Delivers results that arrived as a wait ended by an abort. */
  settled(ctx: ExtensionContext): void {
    if (this.closed || !this.pending.length || !ctx.isIdle()) return;
    wakeIdle(this.pi, this.take());
  }

  shutdown(): void {
    this.closed = true;
    this.unsubscribe();
    this.pending = [];
    this.wake?.();
  }
}
