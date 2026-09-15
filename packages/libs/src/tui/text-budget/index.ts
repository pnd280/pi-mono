import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { z } from "zod";

const characterLimitSchema = z.int().min(2);

export function wrapRows(text: string, width: number): string[] {
  if (width < 1 || text === "") return [];

  // A wide grapheme cannot fit in a one-column viewport. Clamp rather than emit
  // an over-width row, including when a caller's gutter exceeds the viewport.
  return wrapTextWithAnsi(text, width).map((row) => truncateToWidth(row, width, ""));
}

export type RowBudgetOptions = {
  width: number;
  maxRows: number;
  notice: (omittedRows: number) => string;
};

/** The notice occupies one budgeted row; retain both initial and final diagnostics. */
export function compactRows(rows: readonly string[], options: RowBudgetOptions): string[] {
  const { maxRows, width, notice } = options;
  if (maxRows < 1 || width < 1) return [];
  if (rows.length <= maxRows) return [...rows];
  const retained = maxRows - 1;
  const head = Math.ceil(retained / 2);
  const tail = Math.floor(retained / 2);
  const omitted = rows.length - retained;

  return [
    ...rows.slice(0, head),
    truncateToWidth(notice(omitted), width, "…"),
    ...(tail > 0 ? rows.slice(-tail) : [])
  ];
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Input is normalized text with SGR styling only, never raw terminal output. */
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

/** Bound normalized text before styling, preserving whole graphemes and SGR. */
export function textPrefix(text: string, maximum: number): string {
  return text.length <= maximum ? text : text.slice(0, excerptBoundary(text, maximum, "head"));
}

function activeSgr(text: string, end: number): string {
  // Fold SGR through Pi's tracker in bounded batches rather than retain unbounded escapes.
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

export type TextBudgetOptions = {
  width: number;
  maxRows: number;
  /** Maximum UTF-16 code units formatted, divided between the head and tail. */
  maxCharacters: number;
  /** Undefined means the source was excerpted without measuring its full wrapped height. */
  notice: (omittedRows: number | undefined) => string;
};

/** Bound formatting, not retained output. SGR state and whole graphemes survive excerpts. */
export function compactText(text: string, options: TextBudgetOptions): string[] {
  const { maxRows, width, maxCharacters, notice } = options;
  if (!characterLimitSchema.safeParse(maxCharacters).success)
    throw new RangeError("Text formatting limit must be a safe integer of at least two.");
  if (maxRows < 1 || width < 1) return [];
  if (text.length <= maxCharacters) return compactRows(wrapRows(text, width), options);
  const omission = truncateToWidth(notice(undefined), width, "…");
  if (maxRows === 1) return [omission];
  const head = Math.ceil((maxRows - 1) / 2),
    tail = Math.floor((maxRows - 1) / 2);
  const headEnd = excerptBoundary(text, Math.ceil(maxCharacters / 2), "head");
  const tailStart = excerptBoundary(text, text.length - Math.floor(maxCharacters / 2), "tail");

  return [
    ...wrapRows(text.slice(0, headEnd), width).slice(0, head),
    omission,
    ...(tail
      ? wrapRows(activeSgr(text, tailStart) + text.slice(tailStart), width).slice(-tail)
      : [])
  ];
}
