import type { MessageUpdateEvent } from "@earendil-works/pi-coding-agent";

import type { RunSummary } from "./summary.ts";

export class RunThroughput {
  private startedAt: number | undefined;
  /** Visible output only: providers hide or summarise thinking differently. */
  private visible: { at: number; chars: number } | undefined;
  private outputTokens = 0;
  private durationMs = 0;

  start(): void {
    this.startedAt = performance.now();
    this.visible = undefined;
  }

  update({ assistantMessageEvent: event }: MessageUpdateEvent): void {
    if (this.startedAt === undefined) return;
    if (event.type !== "text_delta" && event.type !== "toolcall_delta") return;
    if (!event.delta) return;
    // The first visible delta starts the clock; count only characters received after it.
    if (this.visible) this.visible.chars += event.delta.length;
    else this.visible = { at: performance.now(), chars: 0 };
  }

  end(outputTokens: number): void {
    const startedAt = this.startedAt;
    this.startedAt = undefined;
    this.visible = undefined;
    if (startedAt === undefined) return;

    const durationMs = performance.now() - startedAt;
    // Zero usage can mean the provider did not report it, especially on cancellation.
    if (!Number.isSafeInteger(outputTokens) || outputTokens <= 0 || durationMs <= 0) return;
    this.outputTokens += outputTokens;
    this.durationMs += durationMs;
  }

  /** Live rate: the streaming response's estimate, else the run rate so far. */
  text(): string {
    if (this.visible) {
      const seconds = (performance.now() - this.visible.at) / 1000;
      // Most providers report output usage only on completion; Pi's estimateTokens also uses 4 chars per token.
      const tokens = this.visible.chars / 4;
      if (tokens > 0 && seconds > 0) return `${Math.round(tokens / seconds)}/s`;
    }

    if (this.outputTokens === 0) return "";

    return `${Math.round((this.outputTokens / this.durationMs) * 1000)}/s`;
  }

  finish(): RunSummary["throughput"] {
    if (this.outputTokens === 0) return;

    // Sum tokens and stream time, rather than averaging individual response rates.
    return { outputTokens: this.outputTokens, durationMs: this.durationMs };
  }
}
