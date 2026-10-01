import { setImmediate } from "node:timers/promises";

import { normalizeSearchAsync } from "@pi-mono/libs/text-search";
import { displayText, sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";

import type { Occurrence, Snapshot } from "./model.ts";

export type SearchItem = {
  occurrence: Occurrence;
  display: string;
  normalized: string;
  summary: string;
  time: number | undefined;
};

export function initialHistoryQuery(text: string): string {
  // Two UTF-16 units per code point at most; do not allocate for a restored huge draft.
  if (text.length >= 200 || /[\r\n\u2028\u2029]/u.test(text) || Array.from(text).length >= 100)
    return "";

  return displayText(text.trim());
}

export async function prepareItems(
  snapshot: Snapshot,
  signal?: AbortSignal
): Promise<SearchItem[]> {
  signal?.throwIfAborted();
  const seen = snapshot.collection === "history" ? new Set<string>() : undefined;
  const items: SearchItem[] = [];

  for (const [index, occurrence] of snapshot.entries.entries()) {
    if (index % 16 === 0) await setImmediate();
    signal?.throwIfAborted();

    if (seen) {
      const equality = occurrence.source.text.trim();
      if (seen.has(equality)) continue;
      seen.add(equality);
    }

    const display = displayText(occurrence.source.text);
    const rawTime = occurrence.source.recordedAt;
    const time = typeof rawTime === "string" ? Date.parse(rawTime) : Number.NaN;
    items.push({
      occurrence,
      display,
      normalized: await normalizeSearchAsync(display, signal),
      summary: sliceTerminalText(display, 0, 512).text.replace(/\s+/gu, " ").trim(),
      time: Number.isFinite(time) ? time : undefined
    });
  }

  return items;
}
