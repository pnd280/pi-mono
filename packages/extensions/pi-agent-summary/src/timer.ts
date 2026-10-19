import { formatDuration } from "@pi-mono/libs/tui/duration";

export class AgentTimer {
  private startedAt: number | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private readonly setText: (text?: string) => void;

  constructor(setText: (text?: string) => void) {
    this.setText = setText;
  }

  /** `at` is the run's shared `performance.now()` mark, not this handler's clock reading. */
  start(at: number, showWorkingMessage: boolean): void {
    // Retries and queued continuations may start again before the agent settles.
    if (this.startedAt !== undefined) return;
    this.startedAt = at;
    if (!showWorkingMessage) return;

    // The live timer ticks once a second, so it shows whole seconds.
    const update = () => {
      const seconds = Math.floor(this.elapsed() / 1000);

      this.setText(seconds ? formatDuration(seconds * 1000) : "0s");
    };

    update();
    this.interval = setInterval(update, 1000);
    this.interval.unref();
  }

  /** `at` is the settlement's shared `performance.now()` mark. */
  finish(at: number): { durationMs: number } | undefined {
    if (this.startedAt === undefined) return;
    const summary = { durationMs: this.elapsed(at) };
    this.reset();

    return summary;
  }

  reset(): void {
    if (this.interval !== undefined) clearInterval(this.interval);
    this.interval = undefined;
    this.startedAt = undefined;
    this.setText();
  }

  private elapsed(now = performance.now()): number {
    // A monotonic clock avoids negative or inflated durations after clock changes.
    return this.startedAt === undefined ? 0 : Math.floor(now - this.startedAt);
  }
}
