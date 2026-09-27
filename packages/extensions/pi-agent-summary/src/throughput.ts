import type { RunSummary } from "./summary.ts";

export class RunThroughput {
  private startedAt: number | undefined;
  private outputTokens = 0;
  private durationMs = 0;

  start(): void {
    this.startedAt = performance.now();
  }

  end(outputTokens: number): void {
    const startedAt = this.startedAt;
    this.startedAt = undefined;
    if (startedAt === undefined) return;

    const durationMs = performance.now() - startedAt;
    // Zero usage can mean the provider did not report it, especially on cancellation.
    if (!Number.isSafeInteger(outputTokens) || outputTokens <= 0 || durationMs <= 0) return;
    this.outputTokens += outputTokens;
    this.durationMs += durationMs;
  }

  finish(): RunSummary["throughput"] {
    if (this.outputTokens === 0) return;

    // Sum tokens and stream time, rather than averaging individual response rates.
    return { outputTokens: this.outputTokens, durationMs: this.durationMs };
  }
}
