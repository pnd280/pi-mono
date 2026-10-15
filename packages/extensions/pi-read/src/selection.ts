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
  if (!coordinate.safeParse(firstLine).success)
    throw new RangeError("The source window first line must be a positive safe integer.");
  const selected: SelectedLine[] = [];
  const from = Math.max(0, span.startLine - firstLine);
  const to = Math.min(lines.length - 1, span.endLine - firstLine);

  for (let index = from; index <= to; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    const points = Array.from(line);
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

export function selectionPreview(source: SelectedSource): string {
  if (!source.lines.some((line) => line.text.length > 0))
    return source.partial
      ? "The selection contains no text in this read window. Adjust offset and limit to include it."
      : "The selection contains no text: its lines are empty or its columns are past the line end.";
  const selected = source.lines.map((line) => line.text);
  let truncated = selected.length > 5;
  const excerpt = truncated ? [...selected.slice(0, 2), "…", ...selected.slice(-2)] : selected;
  const bounded = excerpt.map((line) => {
    const points = Array.from(line);
    if (points.length <= 500) return line;
    truncated = true;

    return points.slice(0, 250).join("") + "…" + points.slice(-249).join("");
  });
  const qualifiers = [source.partial ? "partial" : "", truncated ? "truncated" : ""].filter(
    Boolean
  );
  const suffix = qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : "";

  return `Selected source preview${suffix}:\n${bounded.join("\n")}`;
}
