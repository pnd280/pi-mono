export interface OutputText {
  text: string;
  /** UTF-16 ranges of inserted budget notices, never inferred from process output. */
  omissions?: readonly { start: number; end: number }[];
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
