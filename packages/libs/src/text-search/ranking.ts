export type SearchQuery = { phrase: string; terms: readonly string[] };

export type SearchRank = { category: number; score: number };

const chunkSize = 64 * 1024;

type Steps<T> = Generator<void, T, void>;

export function normalizeSearch(text: string): string {
  // Avoid allocating a replacement for every already-normalized ASCII space.
  const collapsed = /(?:\s{2}|[^\S ])/u.test(text) ? text.replace(/\s+/gu, " ") : text;

  return collapsed.trim().toLowerCase();
}

export function prepareSearchQuery(query: string): SearchQuery {
  const phrase = normalizeSearch(query);

  return { phrase, terms: phrase ? phrase.split(" ") : [] };
}

/** KMP keeps even pasted multi-megabyte queries bounded without repeated overlap scans. */
function* containsLong(text: string, query: string): Steps<boolean> {
  const prefixes = new Uint32Array(query.length);
  let matched = 0;

  for (let index = 1; index < query.length; index++) {
    if (index % chunkSize === 0) yield;
    while (matched > 0 && query[index] !== query[matched]) matched = prefixes[matched - 1] ?? 0;
    if (query[index] === query[matched]) matched++;
    prefixes[index] = matched;
  }

  matched = 0;

  for (let index = 0; index < text.length; index++) {
    if (index % chunkSize === 0) yield;
    while (matched > 0 && text[index] !== query[matched]) matched = prefixes[matched - 1] ?? 0;
    if (text[index] === query[matched]) matched++;
    if (matched === query.length) return true;
  }

  return false;
}

function* contains(text: string, query: string): Steps<boolean> {
  if (!query) return true;
  if (query.length > text.length) return false;
  if (query.length > chunkSize) return yield* containsLong(text, query);

  for (let start = 0; start < text.length; start += chunkSize) {
    if (start > 0) yield;
    // Overlap retains literal matches spanning chunk boundaries.
    if (text.slice(start, start + chunkSize + query.length - 1).includes(query)) return true;
  }

  return false;
}

/** Pi's fuzzy scoring, with resumable scans and absolute UTF-16 positions. */
function* fuzzyScore(text: string, query: string): Steps<number | undefined> {
  if (!query) return 0;
  if (query.length > text.length) return undefined;
  let queryIndex = 0;
  let score = 0;
  let lastMatchIndex = -1;
  let consecutiveMatches = 0;

  for (let index = 0; index < text.length && queryIndex < query.length; index++) {
    if (index > 0 && index % chunkSize === 0) yield;
    if (text[index] !== query[queryIndex]) continue;
    const boundary = index === 0 || /[\s\-_./:]/.test(text.charAt(index - 1));

    if (lastMatchIndex === index - 1) {
      consecutiveMatches++;
      score -= consecutiveMatches * 5;
    } else {
      consecutiveMatches = 0;
      if (lastMatchIndex >= 0) score += (index - lastMatchIndex - 1) * 2;
    }

    if (boundary) score -= 10;
    score += index * 0.1;
    lastMatchIndex = index;
    queryIndex++;
  }

  if (queryIndex < query.length) return undefined;

  return query === text ? score - 100 : score;
}

function* fuzzy(text: string, query: string): Steps<number | undefined> {
  const primary = yield* fuzzyScore(text, query);
  if (primary !== undefined) return primary;
  // Preserve Pi's letter/digit transposition fallback and its score penalty.
  const parts = query.match(/^([a-z]+)([0-9]+)$/) ?? query.match(/^([0-9]+)([a-z]+)$/);
  if (!parts) return undefined;
  const swapped = yield* fuzzyScore(text, `${parts[2]}${parts[1]}`);

  return swapped === undefined ? undefined : swapped + 5;
}

/** Internal ranking seam: cooperative search schedules yielded checkpoints. */
export function* rankText(
  normalized: string,
  { phrase, terms }: SearchQuery
): Steps<SearchRank | undefined> {
  if (yield* contains(normalized, phrase)) return { category: 0, score: 0 };
  let literal = true;
  let scanned = 0;

  for (const term of terms) {
    if (scanned > 0 && scanned + normalized.length > chunkSize) {
      yield;
      scanned = 0;
    }

    const found = yield* contains(normalized, term);
    scanned += normalized.length;

    if (!found) {
      literal = false;
      break;
    }
  }

  if (literal) return { category: 1, score: 0 };
  let score = 0;
  scanned = 0;

  for (const term of terms) {
    if (scanned > 0 && scanned + normalized.length > chunkSize) {
      yield;
      scanned = 0;
    }

    const match = yield* fuzzy(normalized, term);
    scanned += normalized.length;
    if (match === undefined) return undefined;
    score += match;
  }

  return { category: 2, score };
}
