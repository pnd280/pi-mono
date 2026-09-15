import { fuzzyMatch } from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/utils/terminal-text";

import { historyRows } from "./history.ts";
import type { Occurrence, Snapshot } from "./model.ts";

export type SearchItem = {
  occurrence: Occurrence;
  display: string;
  normalized: string;
  summary: string;
  time: number | undefined;
};

export const yieldWork = () => new Promise<void>((resolve) => setImmediate(resolve));

export function normalizeSearch(text: string): string {
  // Avoid allocating a replacement for every already-normalized ASCII space.
  const collapsed = /(?:\s{2}|[^\S ])/u.test(text) ? text.replace(/\s+/gu, " ") : text;

  return collapsed.trim().toLowerCase();
}

export function initialHistoryQuery(text: string): string {
  // Two UTF-16 units per code point at most; do not allocate for a restored huge draft.
  if (text.length >= 200 || /[\r\n\u2028\u2029]/u.test(text) || Array.from(text).length >= 100)
    return "";

  return displayText(text.trim());
}

async function normalizeLargeDisplay(text: string): Promise<string> {
  if (text.length < 128 * 1024) return normalizeSearch(text);
  const parts: string[] = [];
  let previousSpace = false;

  for (let start = 0; start < text.length; start += 64 * 1024) {
    await yieldWork();
    let part = text.slice(start, start + 64 * 1024).replace(/\s+/gu, " ");
    if (previousSpace && part.startsWith(" ")) part = part.slice(1);
    if (part) previousSpace = part.endsWith(" ");
    parts.push(part);
  }

  // Lowercase after joining: Unicode final-sigma rules can cross chunk boundaries.
  return parts.join("").trim().toLowerCase();
}

export async function prepareItems(snapshot: Snapshot): Promise<SearchItem[]> {
  const entries =
    snapshot.collection === "history" ? historyRows(snapshot.entries) : snapshot.entries;
  const items: SearchItem[] = [];

  for (const [index, occurrence] of entries.entries()) {
    if (index % 16 === 0) await yieldWork();
    const display = displayText(occurrence.source.text);
    const rawTime = occurrence.source.recordedAt;
    const time = typeof rawTime === "string" ? Date.parse(rawTime) : Number.NaN;
    items.push({
      occurrence,
      display,
      normalized: await normalizeLargeDisplay(display),
      summary: display.slice(0, 512).replace(/\s+/gu, " ").trim(),
      time: Number.isFinite(time) ? time : undefined
    });
  }

  return items;
}

function rank(
  item: SearchItem,
  phrase: string,
  terms: string[]
): { category: number; score: number } | undefined {
  if (item.normalized.includes(phrase)) return { category: 0, score: 0 };
  if (terms.every((term) => item.normalized.includes(term))) return { category: 1, score: 0 };
  let score = 0;

  for (const term of terms) {
    const match = fuzzyMatch(term, item.normalized);

    if (!match.matches) return undefined;
    score += match.score;
  }

  return { category: 2, score };
}

export async function searchItems(
  items: SearchItem[],
  query: string,
  current = () => true
): Promise<SearchItem[]> {
  await yieldWork();
  if (!current()) return [];
  const phrase = normalizeSearch(query);

  if (!phrase) return items;
  const terms = phrase.split(" ");
  const matches: { item: SearchItem; category: number; score: number }[] = [];
  let characters = 0;

  for (const [index, item] of items.entries()) {
    if (index % 16 === 0 || characters >= 256 * 1024) {
      await yieldWork();
      if (!current()) return [];
      characters = 0;
    }

    const ranking = rank(item, phrase, terms);
    characters += item.normalized.length;

    if (ranking) matches.push({ item, ...ranking });
  }

  // Stable sort retains stored order for phrase/term groups and tied fuzzy scores.
  matches.sort((a, b) => a.category - b.category || a.score - b.score);

  return matches.map((match) => match.item);
}
