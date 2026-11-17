import type { MessageUpdateEvent } from "@earendil-works/pi-coding-agent";

import type { RunSummary } from "./summary.ts";

export class RunThroughput {
  /** Visible output only: providers hide or summarise thinking differently. */
  private visible: { at: number; chars: number } | undefined;
  private outputTokens = 0;
  private durationMs = 0;

  update({ assistantMessageEvent: event }: MessageUpdateEvent): void {
    if (event.type !== "text_delta" && event.type !== "toolcall_delta") return;
    if (!event.delta) return;
    // The first visible delta starts the clock; count only characters received after it.
    if (this.visible) this.visible.chars += event.delta.length;
    else this.visible = { at: performance.now(), chars: 0 };
  }

  /** Add one response, timed by Pi; untimed responses are skipped. */
  end(outputTokens: number, durationMs: number | undefined): void {
    this.visible = undefined;
    // Zero usage can mean the provider did not report it, especially on cancellation.
    if (outputTokens <= 0) return;
    if (durationMs === undefined || durationMs <= 0) return;
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
