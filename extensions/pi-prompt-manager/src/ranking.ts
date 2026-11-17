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

/** Passes each start of a nonempty `query` in `text` to `accept`, in order, until it returns true. KMP keeps overlapping matches and pasted multi-megabyte queries linear, without repeated overlap scans. */
function* find(text: string, query: string, accept: (start: number) => boolean): Steps<boolean> {
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

    if (matched === query.length) {
      if (accept(index - query.length + 1)) return true;
      matched = prefixes[matched - 1] ?? 0;
    }
  }

  return false;
}

function* contains(text: string, query: string): Steps<boolean> {
  if (!query) return true;
  if (query.length > text.length) return false;
  if (query.length > chunkSize) return yield* find(text, query, () => true);

  for (let start = 0; start < text.length; start += chunkSize) {
    if (start > 0) yield;
    // Overlap retains matches spanning chunk boundaries.
    if (text.slice(start, start + chunkSize + query.length - 1).includes(query)) return true;
  }

  return false;
}

function isBoundary(text: string, index: number): boolean {
  return index === 0 || /[\s\-_./:]/.test(text.charAt(index - 1));
}

/** Pi's score of one alignment, summed in Pi's order so that equal alignments give equal floats. */
class AlignmentScore {
  score = 0;
  private lastMatchIndex = -1;
  private consecutiveMatches = 0;

  add(text: string, index: number): void {
    if (this.lastMatchIndex === index - 1) {
      this.consecutiveMatches++;
      this.score -= this.consecutiveMatches * 5;
    } else {
      this.consecutiveMatches = 0;
      if (this.lastMatchIndex >= 0) this.score += (index - this.lastMatchIndex - 1) * 2;
    }

    if (isBoundary(text, index)) this.score -= 10;
    this.score += index * 0.1;
    this.lastMatchIndex = index;
  }
}

function* contiguousScore(text: string, start: number, length: number): Steps<number> {
  const alignment = new AlignmentScore();

  for (let offset = 0; offset < length; offset++) {
    if (offset > 0 && offset % chunkSize === 0) yield;
    alignment.add(text, start + offset);
  }

  return alignment.score;
}

/**
 * Pi also scores every contiguous occurrence and keeps the best. A later occurrence scores worse than an earlier one unless only the later one starts at a word boundary, so the first occurrence and the first one at a boundary are the only candidates.
 */
function* bestOccurrence(text: string, query: string): Steps<number | undefined> {
  let first: number | undefined;
  let boundary: number | undefined;

  yield* find(text, query, (start) => {
    first ??= start;
    if (!isBoundary(text, start)) return false;
    boundary = start;

    return true;
  });
  if (first === undefined) return undefined;
  const score = yield* contiguousScore(text, first, query.length);
  if (boundary === undefined || boundary === first) return score;

  return Math.min(score, yield* contiguousScore(text, boundary, query.length));
}

/** Pi's fuzzy scoring, with resumable scans and absolute UTF-16 positions. */
function* fuzzyScore(text: string, query: string): Steps<number | undefined> {
  if (!query) return 0;
  if (query.length > text.length) return undefined;
  const greedy = new AlignmentScore();
  let queryIndex = 0;

  for (let index = 0; index < text.length && queryIndex < query.length; index++) {
    if (index > 0 && index % chunkSize === 0) yield;
    if (text[index] !== query[queryIndex]) continue;
    greedy.add(text, index);
    queryIndex++;
  }

  if (queryIndex < query.length) return undefined;
  const contiguous = yield* bestOccurrence(text, query);
  const score = contiguous === undefined ? greedy.score : Math.min(greedy.score, contiguous);

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
