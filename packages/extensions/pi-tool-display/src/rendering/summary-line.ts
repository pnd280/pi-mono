import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import type { RunSummary, SummarySegment } from "../run-summary.ts";
import type { DisplayTheme } from "./types.ts";

const SEPARATOR = " · ";
const INDENT = "  ";
const RESET = "\x1b[0m";
/** Least space between the last item and the call count on one row. */
const COUNT_GAP = 3;

export type SummaryLineOptions = {
  width: number;
  theme: DisplayTheme;
  /** The run's cards show below the line. */
  open: boolean;
  /** Calls in the run. */
  calls: number;
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

/** Pad a styled row to the full width on the bar surface. Inline resets restart the surface. */
function barRow(row: string, width: number, theme: DisplayTheme): string {
  const clipped = truncateToWidth(row, width, "");
  const padded = clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));

  return padded
    .split(RESET)
    .map((part) => (part ? theme.bg("toolPendingBg", part) : part))
    .join(RESET);
}

/**
 * Pure: one summary line on a full-width bar, wrapped only between items. A marker
 * shows whether the run is open, and the call count sits at the right.
 */
export function renderRunSummary(summary: RunSummary, options: SummaryLineOptions): string[] {
  const { width, theme, open, calls } = options;
  if (width < 1 || !summary.segments.length) return [];
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
  const marker = theme.fg("muted", open ? TUI_GLYPHS.expanded : TUI_GLYPHS.closed);
  const lines = rows.map((row, y) => `${y ? INDENT : `${marker} `}${row}`);
  const count = theme.fg("dim", `${calls} ${calls === 1 ? "call" : "calls"} `);
  const last = lines.at(-1) ?? "";
  const gap = width - visibleWidth(last) - visibleWidth(count);

  // Put the count on its own row when it does not fit after the last item.
  if (gap >= COUNT_GAP) lines[lines.length - 1] = last + " ".repeat(gap) + count;
  else
    lines.push(
      INDENT + " ".repeat(Math.max(0, width - INDENT.length - visibleWidth(count))) + count
    );

  return lines.map((row) => barRow(row, width, theme));
}

/** The bar below an opened run. A click on it returns the run to its summary line. */
export function renderRunFooter(width: number, theme: DisplayTheme): string[] {
  if (width < 1) return [];
  const label = `${theme.fg("muted", TUI_GLYPHS.collapse)} ${theme.fg("dim", "collapse")}`;

  return [barRow(label, width, theme)];
}
