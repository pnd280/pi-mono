import { contentText } from "@earendil-works/pi-ai";
import type { SessionProjection } from "@earendil-works/pi-coding-agent";
import { sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";

const sourceLimit = 4_000;

export function requestSource(text: string): string {
  const trimmed = text.trim();

  return sliceTerminalText(trimmed, 0, sourceLimit).text;
}

/** Model context with Pi's context edits applied, so omitted or replaced text is not sent. */
export type ModelContext = SessionProjection["messages"];

export function firstRequestSource(messages: ModelContext): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = contentText(message.content).trim();
    if (text) return requestSource(text);
  }

  return "";
}

export function conversationSource(messages: ModelContext): string {
  let source = "";

  for (const message of [...messages].reverse()) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = contentText(message.content).trim();
    if (!text) continue;
    const section = `${message.role}: ${text}`;
    source = source ? `${section}\n\n${source}` : section;
    if (source.length >= sourceLimit) break;
  }

  return sliceTerminalText(source, Math.max(0, source.length - sourceLimit), source.length).text;
}
