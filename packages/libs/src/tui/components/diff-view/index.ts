import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  mixColors,
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  type Color
} from "@earendil-works/pi-tui";
import { DiffLine, DiffLineType, diffChanges, type DiffRange } from "@git-diff-view/core";
import type { ParsedPatch, PatchLine } from "@pi-mono/utils/patch";
import { z } from "zod";

import { displayText } from "../../terminal-text/index.ts";
import { wrapRows } from "../../text-budget/index.ts";

const INLINE_DIFF_WORK_LIMIT = 40_000;
const INLINE_DIFF_LINE_LIMIT = 1000;

/** How far strips and changed rows move from the panel surface toward a foreground colour. */
const STRIP_TINT = 0.08;
const CHANGE_TINT = 0.2;

// oxlint-disable-next-line no-control-regex -- Split styled text at full and background resets.
const RESET = /(\x1b\[0?m|\x1b\[49m)/;

interface PatchRow {
  old?: PatchLine | undefined;
  new?: PatchLine | undefined;
}

/** One styled cell row. A changed row's background also colours the adjacent panel padding. */
interface Cell {
  text: string;
  background?: Color | undefined;
}

/** One row inside the panel padding, with the backgrounds of its padding columns. */
interface PanelRow {
  text: string;
  left?: Color | undefined;
  right?: Color | undefined;
  strip?: boolean;
}

/** The theme tokens the panel mixes for its surface, strips, and changed rows. */
export type DiffViewTheme = Pick<Theme, "fg" | "bg" | "bold" | "style"> & {
  colors: Pick<
    Theme["colors"],
    "toolPendingBg" | "toolDiffContext" | "toolDiffAdded" | "toolDiffRemoved"
  >;
};

interface Palette {
  surface: Color;
  strip: Color;
  added: Color;
  removed: Color;
}

export interface DiffViewOptions {
  width: number;
  expanded: boolean;
  /** At least two changed display rows in compact mode; context and structure are additional. */
  compactRows: number;
  contextRows: number;
  expansionHint: string;
  theme: DiffViewTheme;
  highlight: (text: string) => string;
  /**
   * Styled top-strip rows. With multiple hunks, the first row also shows the first hunk's
   * position when it fits beside the caller's text.
   */
  header?: readonly string[];
  /** Styled rows for the bottom strip, after the compact notice. */
  footer?: readonly string[];
}

/** Align replacements within each change block, never across context or hunk boundaries. */
function pairPatchLines(lines: readonly PatchLine[]): PatchRow[] {
  const rows: PatchRow[] = [];
  let removed: PatchLine[] = [],
    added: PatchLine[] = [];

  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++)
      rows.push({ old: removed[index], new: added[index] });
    removed = [];
    added = [];
  };

  for (const line of lines) {
    if (line.kind === "removed") {
      if (added.length) flush();
      removed.push(line);
    } else if (line.kind === "added") added.push(line);
    else {
      flush();
      rows.push({ old: line, new: line });
    }
  }

  flush();

  return rows;
}

function changeRanges(rows: readonly PatchRow[]): Map<PatchLine, DiffRange> {
  const ranges = new Map<PatchLine, DiffRange>();
  let remaining = INLINE_DIFF_WORK_LIMIT;

  for (const row of rows) {
    if (row.old?.kind !== "removed" || row.new?.kind !== "added") continue;
    // Compare terminal-safe text so tabs and stripped controls cannot shift range offsets.
    const before = displayText(row.old.text),
      after = displayText(row.new.text);
    const work = before.length * after.length;
    if (
      !work ||
      work > remaining ||
      Math.max(before.length, after.length) >= INLINE_DIFF_LINE_LIMIT
    )
      continue;
    remaining -= work;
    const { addRange, delRange } = diffChanges(
      new DiffLine(after, DiffLineType.Add, null, null, null),
      new DiffLine(before, DiffLineType.Delete, null, null, null)
    );
    ranges.set(row.old, delRange);
    ranges.set(row.new, addRange);
  }

  return ranges;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function emphasizeChanges(
  source: string,
  styled: string,
  changes: DiffRange | undefined,
  emphasize: (text: string) => string
): string {
  const changed = changes?.range.filter((range) => range.type !== 0) ?? [];
  if (!changed.length) return styled;
  let column = 0,
    start = 0,
    active = false,
    result = "";

  const append = () => {
    const text = sliceByColumn(styled, start, column - start);
    result += active ? emphasize(text) : text;
    start = column;
  };

  // Fast-diff uses UTF-16 offsets. Expand emphasis to whole graphemes before
  // slicing ANSI text by terminal columns, preserving emoji and combining marks.
  for (const { segment, index } of graphemes.segment(source)) {
    const selected = changed.some(
      (range) => range.startIndex < index + segment.length && range.endIndex >= index
    );

    if (selected !== active) {
      append();
      active = selected;
    }

    column += visibleWidth(segment);
  }

  append();

  return result;
}

function token(line: PatchLine): "toolDiffAdded" | "toolDiffRemoved" | "toolDiffContext" {
  if (line.kind === "added") return "toolDiffAdded";
  if (line.kind === "removed") return "toolDiffRemoved";

  return "toolDiffContext";
}

/**
 * Panel colours derived from the theme's tool surface and diff foregrounds. Contrast depends
 * on those supplied colours and the terminal's colour mode.
 */
function panelPalette(theme: DiffViewOptions["theme"]): Palette {
  const { colors } = theme;
  const surface = colors.toolPendingBg;

  return {
    surface,
    strip: mixColors(surface, colors.toolDiffContext, STRIP_TINT, "srgb"),
    added: mixColors(surface, colors.toolDiffAdded, CHANGE_TINT, "srgb"),
    removed: mixColors(surface, colors.toolDiffRemoved, CHANGE_TINT, "srgb")
  };
}

function changeBackground(line: PatchLine, palette: Palette): Color | undefined {
  if (line.kind === "added") return palette.added;
  if (line.kind === "removed") return palette.removed;

  return undefined;
}

/** Clip and pad to exactly `width` columns, ending styles before the padding. */
function padRow(row: string, width: number): string {
  const clipped = truncateToWidth(row, width, "");

  return clipped + "\x1b[0m" + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Apply a background to styled text. Each span between inline resets is styled separately. */
function fill(text: string, background: Color, theme: DiffViewOptions["theme"]): string {
  return (
    text
      .split(RESET)
      .map((part, index) => (index % 2 || !part ? part : theme.style(part, { bg: background })))
      .join("") + "\x1b[0m"
  );
}

function shadeRow(
  row: string,
  line: PatchLine,
  width: number,
  theme: DiffViewOptions["theme"],
  palette: Palette
): Cell {
  // Wrapping retains ANSI state. End each cell's syntax/bold styles before its
  // padding and separator, and restore the row background after inline resets.
  const padded = padRow(row, width);
  const background = changeBackground(line, palette);

  return { text: background ? fill(padded, background, theme) : padded, background };
}

function columnAt(source: string, offset: number): number {
  let column = 0;

  for (const { segment, index } of graphemes.segment(source)) {
    if (index + segment.length > offset) break;
    column += visibleWidth(segment);
  }

  return column;
}

/** Linear focus detection stays available when the quadratic inline comparison is skipped. */
function changeColumns(rows: readonly PatchRow[]): Map<PatchLine, number> {
  const columns = new Map<PatchLine, number>();

  for (const row of rows) {
    if (row.old?.kind !== "removed" || row.new?.kind !== "added") continue;
    const before = displayText(row.old.text),
      after = displayText(row.new.text);
    let start = 0;
    while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
    columns.set(row.old, columnAt(before, start));
    columns.set(row.new, columnAt(after, start));
  }

  return columns;
}

function excerptLine(
  source: string,
  styled: string,
  width: number,
  focus: number,
  theme: DiffViewOptions["theme"]
): string {
  const total = visibleWidth(source);
  if (total <= width) return styled;
  const available = Math.max(1, width - 4);
  const start = Math.max(0, Math.min(focus - Math.floor(available / 4), total - available));
  const excerpt = sliceByColumn(styled, start, available, true);

  return (
    (start ? theme.fg("dim", "… ") : "") +
    excerpt +
    "\x1b[0m" +
    (start + visibleWidth(excerpt) < total ? theme.fg("dim", " …") : "")
  );
}

interface HunkPreview {
  rows: ReadonlySet<PatchRow>;
  excerpts: ReadonlySet<PatchRow>;
}

function isChangedRow(row: PatchRow): boolean {
  return row.old?.kind === "removed" || row.new?.kind === "added";
}

function selectPreviewRows(
  rows: readonly PatchRow[],
  height: (row: PatchRow, excerpt: boolean) => number,
  options: Pick<DiffViewOptions, "compactRows" | "contextRows">
): HunkPreview {
  const selected = new Set<PatchRow>(),
    excerpts = new Set<PatchRow>();
  let remaining = options.compactRows;
  const changed = rows.filter(isChangedRow);

  for (const row of changed.length ? changed : rows.slice(0, 1)) {
    // Count only changed display rows; context and structural rows are additional.
    // Preserve complete wrapped pairs whenever they fit. Excerpt only as needed.
    const excerpt = height(row, false) > remaining;
    const size = height(row, excerpt);
    if (size > remaining) break;
    remaining -= size;
    selected.add(row);
    if (excerpt) excerpts.add(row);
  }

  const anchors = [...selected].map((row) => rows.indexOf(row));

  for (let distance = 1; distance <= options.contextRows; distance++) {
    for (const anchor of anchors) {
      for (const index of [anchor - distance, anchor + distance]) {
        const row = rows[index];
        if (row?.old?.kind !== "context" || selected.has(row)) continue;
        selected.add(row);
        // Long context must not bury the selected changes under wrapped paragraphs.
        if (height(row, false) > height(row, true)) excerpts.add(row);
      }
    }
  }

  return { rows: selected, excerpts };
}

const rowBudgetsSchema = z.object({
  compactRows: z.int().min(2),
  contextRows: z.int().nonnegative()
});

/**
 * Full-width panel with a responsive unified/split layout backed by parsed hunks; no input
 * handling or I/O. Strips above, between, and below the hunks carry caller rows, hunk positions,
 * and the compact notice. Every row is exactly `width` columns.
 */
export function renderDiffPanel(parsed: ParsedPatch, options: DiffViewOptions): string[] {
  if (!rowBudgetsSchema.safeParse(options).success)
    throw new RangeError(
      "Diff row budgets must be safe integers: at least two changed rows, nonnegative context."
    );
  const lines = parsed.hunks.flatMap((hunk) => hunk.lines);
  if (options.width < 1) return [];
  const { width, theme, expanded } = options;
  const palette = panelPalette(theme);
  // One column of panel padding on each side, when the width leaves room for content.
  const padding = width > 2 ? 1 : 0;
  const available = width - 2 * padding;
  const digits = String(
    lines.reduce((maximum, line) => Math.max(maximum, line.oldLine ?? 0, line.newLine ?? 0), 1)
  ).length;
  const hunks = parsed.hunks.map((hunk) => pairPatchLines(hunk.lines));
  let ranges = new Map<PatchLine, DiffRange>();
  const leftWidth = Math.floor((available - 3) / 2),
    rightWidth = available - 3 - leftWidth;
  const split = parsed.added > 0 && parsed.removed > 0 && leftWidth - digits - 2 >= 40;
  const presentations = new Map<PatchLine, { source: string; styled: string }>();
  const sources = new Map<PatchLine, string>();

  const sourceText = (line: PatchLine) => {
    let source = sources.get(line);

    if (source === undefined) {
      source = displayText(line.text);
      sources.set(line, source);
    }

    return source;
  };

  let columns = new Map<PatchLine, number>();

  const presentation = (line: PatchLine) => {
    let value = presentations.get(line);

    if (!value) {
      const source = sourceText(line),
        highlighted = options.highlight(source);
      value = {
        source,
        styled: emphasizeChanges(
          source,
          highlighted === source ? theme.fg(token(line), source) : highlighted,
          ranges.get(line),
          (text) => theme.bg("selectedBg", theme.bold(text))
        )
      };
      presentations.set(line, value);
    }

    return value;
  };

  const lineRows = (
    line: PatchLine | undefined,
    side: "old" | "new",
    cellWidth: number,
    excerpt: boolean
  ): Cell[] => {
    if (!line) return [];
    const { source, styled } = presentation(line);
    const contentWidth = Math.max(1, cellWidth - digits - 2);
    const content = excerpt
      ? excerptLine(source, styled, contentWidth, columns.get(line) ?? 0, theme)
      : styled;
    const number = String(side === "old" ? line.oldLine : line.newLine).padStart(digits);
    const sign = { added: "+", removed: "-", context: " " }[line.kind];
    const gutter = `${theme.fg("dim", number)} ${theme.fg(token(line), sign)}`;
    const wrapped = wrapRows(content, contentWidth);
    const rows = (wrapped.length ? wrapped : [""]).map((row, index) =>
      shadeRow((index ? " ".repeat(digits + 2) : gutter) + row, line, cellWidth, theme, palette)
    );
    if (line.noNewline)
      rows.push(
        ...wrapRows(theme.fg("dim", "\\ No newline at end of file"), Math.max(1, cellWidth)).map(
          (text) => ({ text })
        )
      );

    return rows;
  };

  const join = (left: string, right: string) =>
    `${left}${" ".repeat(Math.max(0, leftWidth - visibleWidth(left)))}${theme.fg("dim", " │ ")}${right}`;

  const strip = (left: string, right = ""): PanelRow => {
    const reserved = right ? visibleWidth(right) + 1 : 0;
    // Caller text can include warnings or totals. Hunk metadata must not displace it.
    const shown = reserved && visibleWidth(left) + reserved <= available ? right : "";
    const text = truncateToWidth(left, available - (shown ? reserved : 0), "…");

    return {
      text: `${text}${" ".repeat(Math.max(0, available - visibleWidth(text) - visibleWidth(shown)))}${shown}`,
      strip: true
    };
  };

  const startLine = (index: number) => {
    const first = parsed.hunks[index]?.lines[0];

    return `line ${first?.newLine ?? first?.oldLine ?? 1}`;
  };

  const hunkStrip = (index: number) =>
    strip(
      theme.fg("accent", `Hunk ${index + 1}/${hunks.length}`),
      theme.fg("dim", startLine(index))
    );

  const edge = (background: Color | undefined) =>
    background ? theme.style(" ", { bg: background }) : " ";

  const paint = (row: PanelRow) => {
    const text = padRow(row.text, available);

    return fill(
      padding ? edge(row.left) + text + edge(row.right) : text,
      row.strip ? palette.strip : palette.surface,
      theme
    );
  };

  const panel = (body: PanelRow[], notice?: string): string[] => {
    const header = (options.header ?? []).flatMap((row) => wrapRows(row, available));
    const position =
      hunks.length > 1 ? theme.fg("dim", `Hunk 1/${hunks.length} · ${startLine(0)}`) : "";
    const rows: PanelRow[] = [];
    if (header.length || position)
      rows.push(strip(header[0] ?? "", position), ...header.slice(1).map((row) => strip(row)));
    rows.push(...body);
    if (notice) rows.push(strip(theme.fg("dim", notice)));
    for (const row of options.footer ?? [])
      rows.push(...wrapRows(row, available).map((text) => strip(text)));

    return rows.map(paint);
  };

  const heights = new Map<PatchLine, { width: number; height: number }>();

  const lineHeight = (line: PatchLine | undefined, cellWidth: number, excerpt: boolean) => {
    if (!line) return 0;
    const contentWidth = Math.max(1, cellWidth - digits - 2);
    // Missing-newline markers are structural rows, not source changes. Charging
    // them here could prevent even the first replacement from being selected.
    if (excerpt) return 1;
    const cached = heights.get(line);
    let height = cached?.width === contentWidth ? cached.height : undefined;

    if (height === undefined) {
      const source = sourceText(line);
      // Only a fit decision is needed. Do not fully wrap a huge line just to
      // discover it exceeds the compact budget; expanded rendering stays exact.
      height =
        visibleWidth(source) > contentWidth * (options.compactRows + 4)
          ? options.compactRows + 5
          : Math.max(1, wrapRows(source, contentWidth).length);
      heights.set(line, { width: contentWidth, height });
    }

    return height;
  };

  const rowHeight = (row: PatchRow, excerpt: boolean) => {
    const left = lineHeight(row.old, split ? leftWidth : available, excerpt);
    if (!split && row.old?.kind === "context") return left;
    const right = lineHeight(row.new, split ? rightWidth : available, excerpt);

    return split ? Math.max(left, right) : left + right;
  };

  const fits = (rows: Iterable<PatchRow>) => {
    let total = 0,
      changed = 0;

    for (const row of rows) {
      const height = rowHeight(row, false);
      total += height;
      if (isChangedRow(row)) changed += height;
      if (total > options.compactRows + 2 * options.contextRows || changed > options.compactRows)
        return false;
    }

    return true;
  };

  const gap = split ? join(theme.fg("dim", "⋮"), theme.fg("dim", "⋮")) : theme.fg("dim", "⋮");

  const renderHunk = (index: number, preview?: HunkPreview): PanelRow[] => {
    const paired = hunks[index];
    const hunk = parsed.hunks[index];
    if (!paired || !hunk) return [];
    const selectedLines =
      preview && new Set([...preview.rows].flatMap((row) => [row.old, row.new]));
    const excerptedLines =
      preview && new Set([...preview.excerpts].flatMap((row) => [row.old, row.new]));
    const rows: PanelRow[] = [];
    let skipped = false;

    const append = (include: boolean, render: () => PanelRow[]) => {
      if (!include) {
        skipped = true;

        return;
      }

      if (skipped && rows.length) rows.push({ text: gap });
      skipped = false;
      rows.push(...render());
    };

    if (split) {
      for (const row of paired)
        append(!preview || preview.rows.has(row), () => {
          const excerpt = preview?.excerpts.has(row) ?? false;
          const left = lineRows(row.old, "old", leftWidth, excerpt);
          const right = lineRows(row.new, "new", rightWidth, excerpt);

          return Array.from({ length: Math.max(left.length, right.length) }, (_, offset) => ({
            text: join(left[offset]?.text ?? "", right[offset]?.text ?? ""),
            left: left[offset]?.background,
            right: right[offset]?.background
          }));
        });
    } else {
      // Selecting paired replacements must not reorder a unified patch's removals/additions.
      for (const line of hunk.lines)
        append(!selectedLines || selectedLines.has(line), () =>
          lineRows(
            line,
            line.kind === "removed" ? "old" : "new",
            available,
            excerptedLines?.has(line) ?? false
          ).map(({ text, background }) => ({ text, left: background, right: background }))
        );
    }

    return rows;
  };

  if (expanded || fits(hunks.flat())) {
    ranges = changeRanges(hunks.flat());

    return panel(
      hunks.flatMap((_, index) => [...(index ? [hunkStrip(index)] : []), ...renderHunk(index)])
    );
  }

  // Choose source changes before applying a displayed-row budget. Wrapped context
  // must never evict the first replacement, and both sides remain selected together.
  const first = hunks[0];
  if (!first) return panel([]);

  const finish = (rows: PanelRow[], excerpted: boolean) => {
    const more = hunks.length - 1;
    const notice = [
      excerpted ? "hunk excerpt" : "",
      more ? `${more} more hunk${more === 1 ? "" : "s"}` : ""
    ]
      .filter(Boolean)
      .join("; ");

    return panel(rows, `… ${notice} (${options.expansionHint})`);
  };

  if (fits(first)) {
    ranges = changeRanges(first);

    return finish(renderHunk(0), false);
  }

  const preview = selectPreviewRows(first, rowHeight, options);
  ranges = changeRanges([...preview.rows]);
  columns = changeColumns([...preview.excerpts]);

  return finish(
    renderHunk(0, preview),
    preview.rows.size < first.length || preview.excerpts.size > 0
  );
}
