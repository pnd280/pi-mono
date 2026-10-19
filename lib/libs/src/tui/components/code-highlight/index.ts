import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";
import { z } from "zod";

import { displayText, sliceTerminalText } from "../../terminal-text/index.ts";

const limitsSchema = z.object({
  maxBytes: z.int().nonnegative(),
  maxLines: z.int().nonnegative(),
  maxLineBytes: z.int().nonnegative()
});

export type CodeHighlightOptions = z.infer<typeof limitsSchema> & {
  path?: string;
  language?: string;
};

/** Zero-based line and UTF-16 offsets within the original, unsanitized line. */
export type CodeSelectionRange = { line: number; start: number; end: number };

/** Accept display-safe source; return it unchanged when language or budget prevents highlighting. */
export function highlightCodeBounded(text: string, options: CodeHighlightOptions): string {
  const { maxBytes, maxLines, maxLineBytes } = options;
  if (!limitsSchema.safeParse(options).success)
    throw new RangeError("Highlight limits must be nonnegative safe integers.");
  const language = options.language ?? getLanguageFromPath(options.path ?? "");
  if (!language || Buffer.byteLength(text) > maxBytes) return text;
  const lines = text.split("\n");
  if (lines.length > maxLines || lines.some((line) => Buffer.byteLength(line) > maxLineBytes))
    return text;

  return highlightCode(text, language).join("\n");
}

/** Sanitize whole lines before applying selection backgrounds to highlighted code. */
export function highlightCodeSelection(
  source: string,
  options: CodeHighlightOptions & {
    ranges: readonly CodeSelectionRange[];
    mark(text: string): string;
  }
): { text: string; hasSelection: boolean } {
  const lines = source.split("\n");
  const displayLine = (text: string) => displayText(text).replaceAll("\n", "");
  const styled = highlightCodeBounded(lines.map(displayLine).join("\n"), options).split("\n");
  let hasSelection = false;

  for (const { line, start, end } of options.ranges) {
    const raw = lines[line];
    const current = styled[line];
    if (raw === undefined || current === undefined || end <= start) continue;
    // Whole-line slicing preserves terminal sequences and graphemes crossing an endpoint.
    const selected = sliceTerminalText(raw, start, end).text;
    const prefix = sliceTerminalText(raw, 0, end).text;
    const length = visibleWidth(displayLine(selected));
    if (length === 0) continue;
    hasSelection = true;
    const column = visibleWidth(displayLine(prefix)) - length;
    styled[line] =
      sliceByColumn(current, 0, column) +
      options.mark(sliceByColumn(current, column, length)) +
      sliceByColumn(current, column + length, visibleWidth(current));
  }

  return { text: styled.join("\n"), hasSelection };
}
