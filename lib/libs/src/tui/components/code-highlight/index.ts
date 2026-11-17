import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

import { displayText, sliceTerminalText } from "../../terminal-text/index.ts";

export type CodeHighlightOptions = {
  maxBytes: number;
  maxLines: number;
  maxLineBytes: number;
  path?: string;
  language?: string;
};

/** Zero-based line and UTF-16 offsets within the original, unsanitised line. */
export type CodeSelectionRange = { line: number; start: number; end: number };

/** Accept display-safe source; return it unchanged when language or budget prevents highlighting. */
export function highlightCodeBounded(text: string, options: CodeHighlightOptions): string {
  const { maxBytes, maxLines, maxLineBytes } = options;
  const language = options.language ?? getLanguageFromPath(options.path ?? "");
  if (!language || Buffer.byteLength(text) > maxBytes) return text;
  const lines = text.split("\n");
  if (lines.length > maxLines || lines.some((line) => Buffer.byteLength(line) > maxLineBytes))
    return text;

  return highlightCode(text, language).join("\n");
}

/** Sanitise whole lines before applying selection backgrounds to highlighted code. */
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
  const selections = new Map<number, { column: number; length: number }[]>();

  for (const { line, start, end } of options.ranges) {
    const raw = lines[line];
    if (raw === undefined || end <= start) continue;
    // Whole-line slicing preserves terminal sequences and graphemes crossing an endpoint.
    const selected = sliceTerminalText(raw, start, end).text;
    const prefix = sliceTerminalText(raw, 0, end).text;
    const length = visibleWidth(displayLine(selected));
    if (length === 0) continue;
    const column = visibleWidth(displayLine(prefix)) - length;
    const spans = selections.get(line) ?? [];
    spans.push({ column, length });
    selections.set(line, spans);
  }

  // Slice every segment from the unmarked line, so earlier marks cannot leak into later slices.
  for (const [line, spans] of selections) {
    const current = styled[line] ?? "";
    let marked = "",
      cursor = 0;

    for (const { column, length } of spans) {
      marked +=
        sliceByColumn(current, cursor, column - cursor) +
        options.mark(sliceByColumn(current, column, length));
      cursor = column + length;
    }

    styled[line] = marked + sliceByColumn(current, cursor, visibleWidth(current));
  }

  return { text: styled.join("\n"), hasSelection: selections.size > 0 };
}
