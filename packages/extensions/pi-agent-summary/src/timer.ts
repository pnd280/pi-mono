import { formatDuration } from "./summary.ts";

export class AgentTimer {
  private startedAt: number | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private readonly setText: (text?: string) => void;

  constructor(setText: (text?: string) => void) {
    this.setText = setText;
  }

  start(showWorkingMessage: boolean): void {
    // Retries and queued continuations may start again before the agent settles.
    if (this.startedAt !== undefined) return;
    this.startedAt = performance.now();
    if (!showWorkingMessage) return;

    const update = () => this.setText(formatDuration(this.elapsed()));
    update();
    this.interval = setInterval(update, 1000);
    this.interval.unref();
  }

  finish(): { durationMs: number } | undefined {
    if (this.startedAt === undefined) return;
    const summary = { durationMs: this.elapsed() };
    this.reset();

    return summary;
  }

  reset(): void {
    if (this.interval !== undefined) clearInterval(this.interval);
    this.interval = undefined;
    this.startedAt = undefined;
    this.setText();
  }

  private elapsed(): number {
    // A monotonic clock avoids negative or inflated durations after clock changes.
    return this.startedAt === undefined ? 0 : Math.floor(performance.now() - this.startedAt);
  }
}
