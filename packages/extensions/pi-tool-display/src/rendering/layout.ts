import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export function wrapRows(text: string, width: number): string[] {
  if (width < 1 || text === "") return [];

  // A wide grapheme cannot fit in a one-column viewport. The final clamp also covers
  // widths smaller than a gutter without emitting an over-width line to pi.
  return wrapTextWithAnsi(text, width).map((row) => truncateToWidth(row, width, ""));
}

/** Budget displayed rows, including the omission hint; retain both initial and final diagnostics. */
export function compactRows(
  rows: readonly string[],
  maximum: number,
  width: number,
  hint: string,
  styleNotice: (text: string) => string = (text) => text
): string[] {
  if (maximum < 1 || width < 1) return [];
  if (rows.length <= maximum) return [...rows];
  const retained = maximum - 1;
  const head = Math.ceil(retained / 2);
  const tail = Math.floor(retained / 2);
  const omitted = rows.length - retained;
  const notice = truncateToWidth(styleNotice(`… ${omitted} more rows (${hint})`), width, "…");

  return [...rows.slice(0, head), notice, ...(tail > 0 ? rows.slice(-tail) : [])];
}

const COMPACT_TEXT_CHARACTERS = 16 * 1024;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Input here is normalized text with SGR styling only, never raw tool output. */
function excerptBoundary(text: string, offset: number, side: "head" | "tail"): number {
  const escape = text.lastIndexOf("\x1b[", offset);

  if (escape >= 0) {
    const end = text.indexOf("m", escape) + 1;
    if (end > offset && escape < offset) offset = side === "head" ? escape : end;
  }

  const segment = graphemes.segment(text).containing(offset);
  if (!segment || segment.index === offset) return offset;

  return side === "head" ? segment.index : segment.index + segment.segment.length;
}

function activeSgr(text: string, end: number): string {
  // A full reset makes earlier state irrelevant. Fold other SGR through Pi's
  // own tracker in bounded batches rather than retaining unbounded escape text.
  const start = Math.max(
    0,
    text.lastIndexOf("\x1b[0m", end - 1),
    text.lastIndexOf("\x1b[m", end - 1)
  );
  const canonical = (codes: string) => wrapTextWithAnsi(codes + "\n", 1).at(-1) ?? "";
  let codes = "";

  // oxlint-disable-next-line no-control-regex
  for (const match of text.slice(start, end).matchAll(/\x1b\[[0-9;:]*m/g)) {
    codes += match[0];
    if (codes.length >= 4096) codes = canonical(codes);
  }

  return canonical(codes);
}

/** Bound formatting, not retained output. Large excerpts intentionally do not
 * claim an exact wrapped-row count for the source that was never wrapped.
 */
export function compactText(
  text: string,
  maximum: number,
  width: number,
  hint: string,
  styleNotice: (text: string) => string = (text) => text
): string[] {
  if (maximum < 1 || width < 1) return [];
  if (text.length <= COMPACT_TEXT_CHARACTERS)
    return compactRows(wrapRows(text, width), maximum, width, hint, styleNotice);
  const notice = truncateToWidth(styleNotice(`… more output (${hint})`), width, "…");
  if (maximum === 1) return [notice];
  const head = Math.ceil((maximum - 1) / 2),
    tail = Math.floor((maximum - 1) / 2);
  const headEnd = excerptBoundary(text, COMPACT_TEXT_CHARACTERS / 2, "head");
  const tailStart = excerptBoundary(text, text.length - COMPACT_TEXT_CHARACTERS / 2, "tail");

  return [
    ...wrapRows(text.slice(0, headEnd), width).slice(0, head),
    notice,
    ...(tail
      ? wrapRows(activeSgr(text, tailStart) + text.slice(tailStart), width).slice(-tail)
      : [])
  ];
}

/** A meaningful item with already measured content.
 * Related notices, metadata, and wrapped lines stay in rows, not separate items.
 */
export interface TreeItem {
  readonly rows: readonly string[];
}

type StructureStyle = (text: string) => string;

function continuationPrefix(hasFollowingSibling: boolean): string {
  return hasFollowingSibling ? "│ " : "  ";
}

/** Assign connectors only after visible siblings are known. followingSibling joins
 * fragments hosted by separate Pi rows without moving their content or images.
 */
export function renderTree(
  items: readonly TreeItem[],
  width: number,
  style: StructureStyle = (text) => text,
  followingSibling = false
): string[] {
  if (width < 1) return [];
  const visible = items.filter((item) => item.rows.length > 0);

  return visible.flatMap((item, index) => {
    const more = index < visible.length - 1 || followingSibling;
    const continuation = "  " + continuationPrefix(more);

    return item.rows.map((row, offset) =>
      truncateToWidth(
        style(offset === 0 ? (more ? "  ├ " : "  └ ") : continuation) + row,
        width,
        ""
      )
    );
  });
}

/** Continuations of the card heading, including parameters. No branch is invented
 * for these lines; the rail exists only when a visible result follows.
 */
export function renderTreeContinuation(
  rows: readonly string[],
  width: number,
  style: StructureStyle = (text) => text,
  hasChildren = false
): string[] {
  if (width < 1) return [];
  const prefix = style("  " + continuationPrefix(hasChildren));

  return rows.map((row) => truncateToWidth(prefix + row, width, ""));
}

export function bodyWidth(width: number): number {
  return Math.max(1, width - 4);
}
