import {
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi
} from "@earendil-works/pi-tui";

import { compactDisplayText, sliceTerminalText } from "../terminal-text/index.ts";

export function wrapRows(text: string, width: number): string[] {
  if (width < 1 || text === "") return [];

  // Wrapping normally fits already. Avoid re-segmenting every styled row just to return it unchanged, including rows a compact preview will discard. Still clamp wide graphemes that cannot fit in a one-column viewport.
  return wrapTextWithAnsi(text, width).map((row) =>
    visibleWidth(row) > width ? truncateToWidth(row, width, "") : row
  );
}

/**
 * Puts styled items on rows of `width`, broken only between items, so no row ends with `separator`. An oversized item wraps, and a following item can share its final row.
 */
export function pack(items: readonly string[], separator: string, width: number): string[] {
  const rows: string[] = [];
  let row = "";

  for (const item of items) {
    if (item === "") continue;

    if (row && !item.includes("\n") && visibleWidth(row + separator + item) <= width) {
      row += separator + item;
      continue;
    }

    if (row) rows.push(row);
    const wrapped = wrapRows(item, width);
    row = wrapped.pop() ?? "";
    // A spread could exceed the argument limit for a long item in a narrow column.
    for (const line of wrapped) rows.push(line);
  }

  if (row) rows.push(row);

  return rows;
}

/** Wraps the first row at `firstWidth` and the remaining text at `restWidth`. */
export function wrapHangingRows(text: string, firstWidth: number, restWidth: number): string[] {
  const [first, ...wrapped] = wrapRows(text, firstWidth);
  if (first === undefined) return [];
  if (restWidth === firstWidth) return [first, ...wrapped];
  if (!wrapped.length || restWidth < 1) return [first];
  // Consume discarded break spaces or one source newline, keeping SGR state.
  const remainder = sliceByColumn(text, visibleWidth(first), Number.POSITIVE_INFINITY).replace(
    // oxlint-disable-next-line no-control-regex
    /^(?:\x1b\[[0-9;:]*m|[^\S\n])*(?:\n)?/,
    (gap) => gap.replace(/\s/g, "")
  );

  return [first, ...(remainder ? wrapRows(remainder, restWidth) : [""])];
}

type RowBudgetOptions = {
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

/** One display line from at most `maxCharacters` of `text`, with `…` when clipped. */
export function displayLine(text: string, maxCharacters = 2048): string {
  const retained = sliceTerminalText(text, 0, maxCharacters).text;

  return compactDisplayText(retained) + (retained.length < text.length ? "…" : "");
}

type TextBudgetOptions = {
  width: number;
  maxRows: number;
  /** Maximum UTF-16 code units formatted, divided between the head and tail. */
  maxCharacters: number;
  /** Undefined means the source was excerpted without measuring its full wrapped height. */
  notice: (omittedRows: number | undefined) => string;
};

/** Bound formatting, not retained output. Excerpts keep whole graphemes and escapes. */
export function compactText(text: string, options: TextBudgetOptions): string[] {
  const { maxRows, width, maxCharacters, notice } = options;
  if (maxRows < 1 || width < 1) return [];
  if (text.length <= maxCharacters) return compactRows(wrapRows(text, width), options);
  const omission = truncateToWidth(notice(undefined), width, "…");
  if (maxRows === 1) return [omission];
  const head = Math.ceil((maxRows - 1) / 2),
    tail = Math.floor((maxRows - 1) / 2);
  const prefix = sliceTerminalText(text, 0, Math.ceil(maxCharacters / 2)).text;
  const suffix = tail
    ? sliceTerminalText(text, text.length - Math.floor(maxCharacters / 2), text.length, {
        preserveSgr: true
      })
    : undefined;

  return [
    ...wrapRows(prefix, width).slice(0, head),
    omission,
    ...(suffix ? wrapRows(suffix.leadingSgr + suffix.text, width).slice(-tail) : [])
  ];
}
