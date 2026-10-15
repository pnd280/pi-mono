import {
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi
} from "@earendil-works/pi-tui";
import { z } from "zod";

import { sliceTerminalText } from "../terminal-text/index.ts";

const characterLimitSchema = z.int().min(2);

export function wrapRows(text: string, width: number): string[] {
  if (width < 1 || text === "") return [];

  // Wrapping normally fits already. Avoid re-segmenting every styled row just
  // to return it unchanged, including rows a compact preview will discard.
  // Still clamp wide graphemes that cannot fit in a one-column viewport.
  return wrapTextWithAnsi(text, width).map((row) =>
    visibleWidth(row) > width ? truncateToWidth(row, width, "") : row
  );
}

/** Wraps the first row at `firstWidth` and the remaining text at `restWidth`. */
export function wrapHangingRows(text: string, firstWidth: number, restWidth: number): string[] {
  const [first, ...wrapped] = wrapRows(text, firstWidth);
  if (first === undefined) return [];
  if (!wrapped.length) return [first];
  const start = visibleWidth(first);
  // Wrapping drops the space at the break; the remainder keeps earlier styles.
  const space = stripTerminalSequences(sliceByColumn(text, start, 1)) === " ";

  return [
    first,
    ...wrapRows(sliceByColumn(text, start + (space ? 1 : 0), visibleWidth(text)), restWidth)
  ];
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

/** Bound normalized text before styling, preserving whole graphemes and SGR. */
export function textPrefix(text: string, maximum: number): string {
  return sliceTerminalText(text, 0, maximum).text;
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
  const prefix = textPrefix(text, Math.ceil(maxCharacters / 2));
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
