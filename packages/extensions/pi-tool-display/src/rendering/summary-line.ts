import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import type { RunSummary, SummarySegment } from "../run-summary.ts";
import type { DisplayTheme } from "./types.ts";

const SEPARATOR = " · ";
const INDENT = "  ";

export type SummaryLineOptions = {
  width: number;
  theme: DisplayTheme;
};

type Color = Parameters<DisplayTheme["fg"]>[0];

/**
 * Card colors: the leading verb is an action in `accent` (bold for the line's first
 * item), the count is `text`, and remaining words are `muted`. Sentence case applies
 * unless the leading word is a tool name.
 */
function styledTemplate(
  template: string,
  n: number,
  theme: DisplayTheme,
  options: { first: boolean; recase: boolean }
): string {
  const { first, recase } = options;
  const verb = /^([^{\s]+)(?=\s)/.exec(template)?.[1];
  let rest = template;
  let text = "";

  if (verb) {
    const initial = first ? verb.charAt(0).toUpperCase() : verb.charAt(0).toLowerCase();
    const cased = recase ? initial + verb.slice(1) : verb;
    text = theme.fg("accent", first ? theme.bold(cased) : cased);
    rest = template.slice(verb.length);
  } else if (first && recase && !template.startsWith("{"))
    rest = template.charAt(0).toUpperCase() + template.slice(1);

  for (const part of rest.split(/(\{n\})/)) {
    if (!part) continue;
    text += part === "{n}" ? theme.fg("text", String(n)) : theme.fg("muted", part);
  }

  return text;
}

function segmentText(segment: SummarySegment, theme: DisplayTheme, first: boolean): string {
  const { category, count, counts, toolNamed } = segment;
  const text = styledTemplate(
    compactDisplayText(count === 1 ? category.count.one : category.count.other),
    count,
    theme,
    { first, recase: !toolNamed }
  );
  const markers: [number, string, Color][] = [
    [counts.failed, "failed", "error"],
    [counts.cancelled, "cancelled", "error"],
    [counts.unavailable, "unavailable", "muted"]
  ];

  return (
    text +
    markers
      .filter(([value]) => value > 0)
      .map(([value, label, color]) => theme.fg(color, ` (${value} ${label})`))
      .join("")
  );
}

/** Pure: one summary line, wrapped only between items. */
export function renderRunSummary(summary: RunSummary, options: SummaryLineOptions): string[] {
  const { width, theme } = options;
  if (width < 1) return [];
  const contentWidth = Math.max(1, width - INDENT.length);
  const separator = theme.fg("dim", SEPARATOR);
  const items = summary.segments.map((segment, index) =>
    truncateToWidth(segmentText(segment, theme, index === 0), contentWidth, "…")
  );
  const rows: string[] = [];
  let current = "";

  for (const item of items) {
    // Wrap only between items, aligned with the first item.
    if (current && visibleWidth(current + separator + item) <= contentWidth)
      current += separator + item;
    else {
      if (current) rows.push(current);
      current = item;
    }
  }

  if (current) rows.push(current);

  return rows.map((row) => truncateToWidth(`${INDENT}${row}`, width, ""));
}

/** Pure: an opened run's collapse action, a rule that spans the row. */
export function renderCollapseRow(options: SummaryLineOptions): string {
  return options.theme.fg("dim", TUI_GLYPHS.tree.horizontal.repeat(Math.max(0, options.width)));
}
