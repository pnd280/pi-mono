import { z } from "zod";

const offsetRangeSchema = z
  .object({ start: z.int().nonnegative(), end: z.int().nonnegative() })
  .refine(({ start, end }) => end >= start);

export type OutputOmission = {
  count: number;
  unit: "bytes" | "lines" | "retained-lines";
};

/** Consumers own notice wording and any surrounding style resets. */
export type OmissionFormatter = (omission: OutputOmission) => OutputText;

export interface OutputText {
  text: string;
  /** UTF-16 ranges of inserted budget notices, never inferred from process output. */
  omissions?: readonly { readonly start: number; readonly end: number }[];
}

export type OutputFragment = { kind: "output" | "omission"; text: string };

function assertValidOmissions(output: OutputText): void {
  let end = 0;

  for (const range of output.omissions ?? []) {
    if (
      !offsetRangeSchema.safeParse(range).success ||
      range.start < end ||
      range.end > output.text.length
    )
      throw new RangeError(
        "Omission ranges must be ordered, nonoverlapping UTF-16 offsets within the text."
      );
    end = range.end;
  }
}

/** Partition by generated UTF-16 ranges, never by matching notice wording. */
export function splitOutputText(output: OutputText): OutputFragment[] {
  assertValidOmissions(output);
  const fragments: OutputFragment[] = [];
  let start = 0;

  for (const range of output.omissions ?? []) {
    if (range.start > start)
      fragments.push({ kind: "output", text: output.text.slice(start, range.start) });
    if (range.end > range.start)
      fragments.push({ kind: "omission", text: output.text.slice(range.start, range.end) });
    start = range.end;
  }

  if (start < output.text.length)
    fragments.push({ kind: "output", text: output.text.slice(start) });

  return fragments;
}

export function outputOmission(text: string): OutputText {
  return { text, omissions: [{ start: 0, end: text.length }] };
}

export function joinOutputText(
  parts: readonly (string | OutputText)[],
  separator = ""
): OutputText {
  let text = "";
  const omissions: { start: number; end: number }[] = [];

  for (const [index, part] of parts.entries()) {
    if (index) text += separator;

    if (typeof part === "string") text += part;
    else {
      assertValidOmissions(part);
      for (const range of part.omissions ?? [])
        omissions.push({ start: text.length + range.start, end: text.length + range.end });
      text += part.text;
    }
  }

  return { text, omissions };
}

export function sliceOutputText(
  output: OutputText,
  start: number,
  end = output.text.length
): OutputText {
  if (!offsetRangeSchema.safeParse({ start, end }).success)
    throw new RangeError("Output slices require ordered, nonnegative UTF-16 offsets.");
  assertValidOmissions(output);

  return {
    text: output.text.slice(start, end),
    omissions: (output.omissions ?? [])
      .filter((range) => range.start < end && range.end > start)
      .map((range) => ({
        start: Math.max(start, range.start) - start,
        end: Math.min(end, range.end) - start
      }))
  };
}
