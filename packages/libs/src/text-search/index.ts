import { setImmediate } from "node:timers/promises";

import {
  normalizeSearch,
  prepareSearchQuery,
  rankText,
  type SearchRank
} from "@pi-mono/utils/text-search";

/** Preserve whole-string Unicode case rules while yielding during whitespace normalization. */
export async function normalizeSearchAsync(text: string, signal?: AbortSignal): Promise<string> {
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
