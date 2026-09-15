import { keyText, type Theme } from "@earendil-works/pi-coding-agent";
import type { CodeHighlightOptions } from "@pi-mono/libs/tui/components/code-highlight";
import { renderTree, type TreeItem } from "@pi-mono/libs/tui/components/tree";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { compactText, wrapRows } from "@pi-mono/libs/tui/text-budget";

import { bodyWidth } from "./layout.ts";
import type { Projection, DisplayTheme } from "./types.ts";

const MAX_HIGHLIGHT_BYTES = 512 * 1024;

export const expansionHint = () => `${keyText("app.tools.expand")} to expand`;

export const codeHighlightLimits = {
  maxBytes: MAX_HIGHLIGHT_BYTES,
  maxLines: 10_000,
  maxLineBytes: 4096
} satisfies CodeHighlightOptions;

export function tree(
  items: readonly TreeItem[],
  p: Projection,
  followingSibling = false
): string[] {
  return renderTree(items, {
    width: p.width,
    indent: 2,
    style: (text) => p.theme.fg("dim", text),
    followingSibling
  });
}

export function styleParameters(text: string, theme: DisplayTheme): string {
  if (Buffer.byteLength(text) > MAX_HIGHLIGHT_BYTES) return theme.fg("text", text);

  // Tokenize our serialized JSON, not arbitrary output. Quoted values may contain
  // punctuation and escaped quotes that must not be mistaken for structure.
  return text.replace(
    /"(?:\\.|[^"\\])*"(\s*:)?|[{}[\],:]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null/g,
    (token: string, colon: string | undefined) =>
      theme.fg(colon || "{}[],:".includes(token) ? "dim" : "text", token)
  );
}

export function output(text: string, p: Projection, maximum = 5, expanded = p.expanded): string[] {
  const width = bodyWidth(p.width);

  return expanded || maximum === Number.MAX_SAFE_INTEGER
    ? wrapRows(text, width)
    : compactText(text, {
        maxRows: maximum,
        width,
        maxCharacters: 16 * 1024,
        notice: (omitted) =>
          p.theme.fg(
            "dim",
            omitted === undefined
              ? `… more output (${expansionHint()})`
              : `… ${omitted} more rows (${expansionHint()})`
          )
      });
}

export function message(text: string, p: Projection, color: Parameters<Theme["fg"]>[0]): string[] {
  return wrapRows(p.theme.fg(color, displayText(text)), bodyWidth(p.width));
}

export function reference(label: string, value: string, p: Projection): string {
  return p.theme.fg("dim", label) + p.theme.fg("text", displayText(value));
}
