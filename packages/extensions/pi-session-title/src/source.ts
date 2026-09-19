import { contentText } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";

const sourceLimit = 4_000;

export function requestSource(text: string): string {
  const trimmed = text.trim();

  return sliceTerminalText(trimmed, 0, sourceLimit).text;
}

export function firstRequestSource(entries: readonly SessionEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const text = contentText(entry.message.content).trim();
    if (text) return requestSource(text);
  }

  return "";
}

/** The caller supplies the active branch, not the session's append-order history. */
export function conversationSource(entries: readonly SessionEntry[]): string {
  let source = "";

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.type !== "message") continue;
    const { message } = entry;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = contentText(message.content).trim();
    if (!text) continue;
    const section = `${message.role}: ${text}`;
    source = source ? `${section}\n\n${source}` : section;
    if (source.length >= sourceLimit) break;
  }

  return sliceTerminalText(source, Math.max(0, source.length - sourceLimit), source.length).text;
}
