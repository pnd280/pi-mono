import { z } from "zod";

const coordinate = z.int().min(1);

/** Absolute file lines and Unicode code point columns, all starting at one. */
export const selectionInputSchema = z.strictObject({
  startLine: coordinate.describe("First selected file line, starting at 1"),
  startColumn: coordinate
    .optional()
    .describe("First selected Unicode code point, starting at 1; defaults to 1"),
  endLine: coordinate.optional().describe("Last selected file line; defaults to startLine"),
  endColumn: coordinate
    .optional()
    .describe("Exclusive Unicode code point column on endLine; omit to select through the line end")
});

export const selectionSchema = selectionInputSchema
  .transform((input) => ({
    ...input,
    startColumn: input.startColumn ?? 1,
    endLine: input.endLine ?? input.startLine
  }))
  .refine(
    (span) =>
      span.endLine > span.startLine ||
      (span.endLine === span.startLine &&
        (span.endColumn === undefined || span.endColumn > span.startColumn))
  );

export type Selection = z.output<typeof selectionSchema>;

export interface SelectedLine {
  index: number;
  before: string;
  text: string;
}

export interface SelectedSource {
  lines: SelectedLine[];
  partial: boolean;
}

/** Coordinates address raw code points, before terminal sanitization or tab expansion. */
export function selectSource(
  lines: readonly string[],
  firstLine: number,
  span: Selection
): SelectedSource {
  const selected: SelectedLine[] = [];
  const from = Math.max(0, span.startLine - firstLine);
  const to = Math.min(lines.length - 1, span.endLine - firstLine);

  for (let index = from; index <= to; index++) {
    const points = Array.from(lines[index]!);
    const number = firstLine + index;
    const start = number === span.startLine ? span.startColumn - 1 : 0;
    const end =
      number === span.endLine && span.endColumn !== undefined ? span.endColumn - 1 : points.length;
    selected.push({
      index,
      before: points.slice(0, start).join(""),
      text: points.slice(start, end).join("")
    });
  }

  return {
    lines: selected,
    partial: span.startLine < firstLine || span.endLine >= firstLine + lines.length
  };
}

export function selectionLabel(span: Selection): string {
  const start =
    span.startColumn === 1 ? `${span.startLine}` : `${span.startLine}:${span.startColumn}`;
  if (span.endLine === span.startLine && span.endColumn === undefined) return start;
  const end =
    span.endColumn === undefined ? `${span.endLine}` : `${span.endLine}:${span.endColumn}`;

  return `${start}-${end}`;
}
