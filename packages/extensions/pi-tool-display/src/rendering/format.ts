import {
  getLanguageFromPath,
  highlightCode,
  keyText,
  type Theme
} from "@earendil-works/pi-coding-agent";

import { displayText } from "../terminal-text.ts";
import { bodyWidth, compactText, renderTree, wrapRows, type TreeItem } from "./layout.ts";
import type { Projection, DisplayTheme } from "./types.ts";

const MAX_HIGHLIGHT_BYTES = 512 * 1024;

export const expansionHint = () => `${keyText("app.tools.expand")} to expand`;

export function highlight(
  text: string,
  path: string,
  language = getLanguageFromPath(path)
): string {
  if (!language || Buffer.byteLength(text) > MAX_HIGHLIGHT_BYTES) return text;
  const lines = text.split("\n");
  if (lines.length > 10_000 || lines.some((line) => Buffer.byteLength(line) > 4096)) return text;

  return highlightCode(text, language).join("\n");
}

export function tree(
  items: readonly TreeItem[],
  p: Projection,
  followingSibling = false
): string[] {
  return renderTree(items, p.width, (text) => p.theme.fg("dim", text), followingSibling);
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
    : compactText(text, maximum, width, expansionHint(), (notice) => p.theme.fg("dim", notice));
}

export function message(text: string, p: Projection, color: Parameters<Theme["fg"]>[0]): string[] {
  return wrapRows(p.theme.fg(color, displayText(text)), bodyWidth(p.width));
}

export function reference(label: string, value: string, p: Projection): string {
  return p.theme.fg("dim", label) + p.theme.fg("text", displayText(value));
}
