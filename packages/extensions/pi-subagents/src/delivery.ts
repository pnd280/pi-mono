import type {
  AgentBeforeSettleEventResult,
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext
} from "@earendil-works/pi-coding-agent";
import type { WorkingMessageHandle } from "@pi-mono/libs/working-message";
import { wakeIdle } from "@pi-mono/utils/idle-wake";

import { RESULT_MESSAGE } from "./constants.ts";
import { lateUsage, taskResult } from "./result.ts";
import type { ManagedTask, TaskEvent, Tasks } from "./tasks.ts";

type Completion = { task: ManagedTask; message: Parameters<ExtensionAPI["sendMessage"]>[0] };

type WaitResult = "closed" | "result" | "none" | "input" | "abort";

/** Working-message text while the supervisor waits for background tasks. */
const WAITING_MESSAGE = "Waiting for background subagents";

/** New input arrives through Pi's queue, which has no event; poll it at this interval. */
const INPUT_POLL_MS = 250;

/** Owns background completions until the settlement or idle handoff. */
export class Delivery {
  private pending: Completion[] = [];
  private delivered = new WeakSet<ManagedTask>();
  private suppressed = new WeakSet<ManagedTask>();
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

    if (
      !event.task.details.background ||
      this.delivered.has(event.task) ||
      (this.suppressed.has(event.task) && event.result.outcome === "cancelled")
    ) {
      // A suppressed completion still changes the number of remaining tasks.
      this.wake?.();

      return;
    }

    const result = taskResult(
      event.task.details,
      event.result.text,
      undefined,
      `Background task ${event.result.outcome}: ${event.task.details.description}`
    );
    const late = lateUsage(event.task.reported, event.result.usageEnd, event.task.details.model);
    const completion: Completion = {
      task: event.task,
      message: {
        customType: RESULT_MESSAGE,
        display: true,
        content: result.content,
        // `late_usage` becomes a hidden usage entry when Pi persists this message.
        details: { ...result.details, ...(late ? { late_usage: late } : {}) }
      }
    };
    this.pending.push(completion);

    if (this.waiting) {
      this.wake?.();

      return;
    }

    // Busy results stay owned here until Pi can commit them or the aborted run settles.
    if (this.ctx.isIdle())
      wakeIdle(
        this.pi,
        this.take().map(({ message }) => message),
        "Background subagent finished."
      );
  }

  private take(): Completion[] {
    const pending = this.pending;
    this.pending = [];
    for (const completion of pending) this.delivered.add(completion.task);

    return pending;
  }

  /** Drops only a cancellation result; a task that finished before the abort keeps its result. */
  suppress(task: ManagedTask): void {
    this.suppressed.add(task);
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

  private hasBackground(): boolean {
    return this.tasks.direct().some((task) => task.details.background);
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
      for (const { message } of this.take()) this.pi.sendMessage(message, { triggerTurn: false });

      return { continue: true };
    } finally {
      this.waiting = false;
    }
  }

  /** Delivers results that arrived as a wait ended by an abort. */
  settled(ctx: ExtensionContext): void {
    if (this.closed || !this.pending.length || !ctx.isIdle()) return;
    wakeIdle(
      this.pi,
      this.take().map(({ message }) => message),
      "Background subagent finished."
    );
  }

  shutdown(): void {
    this.closed = true;
    this.unsubscribe();
    this.pending = [];
    this.wake?.();
  }
}
