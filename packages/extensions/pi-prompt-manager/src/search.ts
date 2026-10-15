import { setImmediate } from "node:timers/promises";

import { displayText, sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";

import type { Occurrence, Snapshot } from "./model.ts";
import { normalizeSearch, prepareSearchQuery, rankText, type SearchRank } from "./ranking.ts";

export type SearchItem = {
  occurrence: Occurrence;
  display: string;
  normalized: string;
  summary: string;
  time: number | undefined;
};

/** Preserve whole-string Unicode case rules while yielding during whitespace normalization. */
async function normalizeSearchAsync(text: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (text.length < 128 * 1024) return normalizeSearch(text);
  const parts: string[] = [];
  let previousSpace = false;

  for (let start = 0; start < text.length; start += 64 * 1024) {
    await setImmediate();
    signal?.throwIfAborted();
    let part = text.slice(start, start + 64 * 1024).replace(/\s+/gu, " ");
    if (previousSpace && part.startsWith(" ")) part = part.slice(1);
    if (part) previousSpace = part.endsWith(" ");
    parts.push(part);
  }

  // Lowercase after joining: Unicode final-sigma rules can cross chunk boundaries.
  return parts.join("").trim().toLowerCase();
}

/** Keep caller objects and stable input order; discard results when current() becomes false. */
export async function searchText<T extends { normalized: string }>(
  items: T[],
  query: string,
  current = () => true
): Promise<T[]> {
  await setImmediate();
  if (!current()) return [];
  const prepared = prepareSearchQuery(query);

  if (!prepared.phrase) return items;
  const matches: (SearchRank & { item: T })[] = [];
  let characters = 0;

  for (const [index, item] of items.entries()) {
    if (index % 16 === 0 || characters >= 256 * 1024) {
      await setImmediate();
      if (!current()) return [];
      characters = 0;
    }

    const steps = rankText(item.normalized, prepared);
    let next = steps.next();

    while (!next.done) {
      await setImmediate();
      if (!current()) return [];
      next = steps.next();
    }

    characters += item.normalized.length;
    if (next.value) matches.push({ item, ...next.value });
  }

  // Stable sort retains input order for phrase/term groups and tied fuzzy scores.
  matches.sort((a, b) => a.category - b.category || a.score - b.score);

  return matches.map((match) => match.item);
}

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
