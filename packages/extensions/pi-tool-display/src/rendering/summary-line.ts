import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { pack } from "@pi-mono/libs/tui/text-budget";

import type { ChangedFile, RunSummary, SummarySegment } from "../run-summary.ts";
import type { DisplayTheme } from "./types.ts";

const SEPARATOR = " · ";
const INDENT = "  ";
const RESET = "\x1b[0m";
/** Least space between the last item and the call count on one row. */
const COUNT_GAP = 3;
/** Most rows below a closed line; with more changed files, the last row counts the rest. */
const FILE_ROWS = 8;
/** Columns of the tree guide and kind marker before a file's path. */
const FILE_LEAD = 6;
const FILE_GAP = "  ";

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
 * Card colours: the leading verb is an action in `accent` (bold for the line's first item), the count is `text`, and remaining words are `muted`. Sentence case applies unless the leading word is a tool name.
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
  const padded = truncateToWidth(row, width, "", true);

  return padded
    .split(RESET)
    .map((part) => (part ? theme.bg("toolPendingBg", part) : part))
    .join(RESET);
}

/** Drop leading directories until the path fits. A file name that is still too wide loses its end. */
function fitPath(path: string, width: number): string {
  if (visibleWidth(path) <= width) return path;
  const parts = path.split("/");
  let shown = parts.pop() ?? "";
  if (!parts.length) return truncateToWidth(shown, width, "…");
  let used = visibleWidth(`…/${shown}`);

  // The first part stays out: with it, the path would be whole.
  for (const part of parts.slice(1).reverse()) {
    used += visibleWidth(part) + 1;
    if (used > width) break;
    shown = `${part}/${shown}`;
  }

  return truncateToWidth(`…/${shown}`, width, "…");
}

/** The kind marker, and what follows the path: line counts, an unsuccessful outcome, repeated changes. */
function fileStatus(file: ChangedFile, theme: DisplayTheme): { marker: string; notes: string } {
  const { created, outcome, lines, changes } = file;
  const notes: string[] = [];
  let marker = created ? theme.fg("success", "A") : theme.fg("warning", "M");

  if (lines)
    notes.push(
      theme.fg("toolDiffAdded", `+${lines.added}`) +
        (lines.removed ? theme.fg("toolDiffRemoved", ` -${lines.removed}`) : "")
    );

  if (outcome === "failure" || outcome === "cancelled") {
    marker = theme.fg("error", TUI_GLYPHS.outcome[outcome]);
    notes.push(theme.fg("error", outcome === "failure" ? "failed" : "cancelled"));
  } else if (outcome === "unavailable") {
    marker = theme.fg("muted", created ? "A" : "M");
    notes.push(theme.fg("muted", "unavailable"));
  }

  if (changes > 1) notes.push(theme.fg("dim", `${changes} edits`));

  return { marker: theme.bold(marker), notes: notes.join(FILE_GAP) };
}

/**
 * The run's changed files as a tree below its closed line: kind, path, then line counts in one column.
 */
function fileRows(files: readonly ChangedFile[], width: number, theme: DisplayTheme): string[] {
  const shown = files.length > FILE_ROWS ? files.slice(0, FILE_ROWS - 1) : files;
  const hidden = files.length - shown.length;
  const entries = shown.map((file) => ({
    path: compactDisplayText(file.path),
    ...fileStatus(file, theme)
  }));
  const notesWidth = Math.max(0, ...entries.map((entry) => visibleWidth(entry.notes)));
  const available = Math.max(1, width - FILE_LEAD);
  // Paths keep at least half of a narrow row; the notes after them are cut first.
  const pathWidth = Math.min(
    Math.max(1, ...entries.map((entry) => visibleWidth(entry.path))),
    Math.max(
      available - (notesWidth ? FILE_GAP.length + notesWidth : 0),
      Math.min(available, Math.ceil(width / 2))
    )
  );
  const guide = (last: boolean) =>
    theme.fg("dim", `  ${last ? TUI_GLYPHS.tree.lastBranch : TUI_GLYPHS.tree.branch} `);
  const rows = entries.map(({ path, marker, notes }, index) => {
    const fitted = fitPath(path, pathWidth);
    const name = fitted.lastIndexOf("/") + 1;
    const target =
      theme.fg("muted", fitted.slice(0, name)) + theme.fg("text", theme.bold(fitted.slice(name)));
    const padding = " ".repeat(pathWidth - visibleWidth(fitted));

    return `${guide(index === entries.length - 1 && !hidden)}${marker} ${target}${notes ? padding + FILE_GAP + notes : ""}`;
  });

  if (hidden) rows.push(guide(true) + theme.fg("muted", `… ${hidden} more changed files`));

  return rows.map((row) => truncateToWidth(row, width, ""));
}

/**
 * Pure: one summary line on a full-width bar, wrapped only between items. A marker shows whether the run is open, and the call count sits at the right. A closed line lists the run's changed files below the bar.
 */
export function renderRunSummary(summary: RunSummary, options: SummaryLineOptions): string[] {
  const { width, theme, open, calls } = options;
  if (width < 1 || !summary.segments.length) return [];
  const contentWidth = Math.max(1, width - INDENT.length);
  const separator = theme.fg("dim", SEPARATOR);
  const items = summary.segments.map((segment, index) =>
    truncateToWidth(segmentText(segment, theme, index === 0), contentWidth, "…")
  );
  const rows = pack(items, separator, contentWidth);
  const marker = theme.fg("muted", open ? TUI_GLYPHS.expanded : TUI_GLYPHS.closed);
  const lines = rows.map((row, y) => `${y ? INDENT : `${marker} `}${row}`);
  const count = theme.fg("dim", `${calls} ${calls === 1 ? "call" : "calls"} `);
  const last = lines.at(-1) ?? "";
  const gap = width - visibleWidth(last) - visibleWidth(count);

  if (gap >= COUNT_GAP) lines[lines.length - 1] = last + " ".repeat(gap) + count;
  else
    lines.push(
      INDENT + " ".repeat(Math.max(0, width - INDENT.length - visibleWidth(count))) + count
    );

  return [
    ...lines.map((row) => barRow(row, width, theme)),
    // The cards of an opened run already name its files.
    ...(open ? [] : fileRows(summary.changes, width, theme))
  ];
}

/** The bar below an opened run. A click on it returns the run to its summary line. */
export function renderRunFooter(width: number, theme: DisplayTheme): string[] {
  if (width < 1) return [];
  const label = `${theme.fg("muted", TUI_GLYPHS.collapse)} ${theme.fg("dim", "collapse")}`;

  return [barRow(label, width, theme)];
}
