import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

import { displayText, sliceTerminalText } from "../../terminal-text/index.ts";
import { highlightCodeBounded, type CodeHighlightOptions } from "./bounded.ts";

/** Zero-based line and UTF-16 offsets within the original, unsanitized line. */
export type CodeSelectionRange = { line: number; start: number; end: number };

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
