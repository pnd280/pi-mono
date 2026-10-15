import type { Theme } from "@earendil-works/pi-coding-agent";
import { Loader, truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";
import { renderOverflowBorder } from "@pi-mono/libs/tui/components/text-preview";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";

import type { JobRecord } from "../jobs/records.ts";
import type { TaskRecord } from "../tasks/records.ts";
import { elapsed } from "../tasks/render.ts";
import { contextLabel, status, usageParts } from "./board.ts";

/** A Loader whose animated frame is drawn inline, without its own row; the status row colours it. */
export class Spinner extends Loader {
  constructor(tui: TUI) {
    super(
      tui,
      (text) => text,
      (text) => text,
      ""
    );
  }

  frame(): string {
    return this.getRenderedIndicator();
  }
}

/** The description keeps at least this many columns before the short ID shows. */
const MIN_DESCRIPTION_WIDTH = 16;

/**
 * The top border: a chip with the kind, the bold description, and the dim kind and short ID, as
 * in `─ TASK  Fix login ───── task 8f3a2c1e ─`. At least three border columns follow the
 * description; the ID drops out first.
 */
function titleBorder(
  theme: Theme,
  kind: "task" | "job",
  description: string,
  id: string,
  width: number
): string {
  const border = (text: string) => theme.fg("border", text);
  const chip = ` ${kind.toUpperCase()} `;
  const lead = 2 + chip.length + 1;
  let right = compactDisplayText(`${kind} ${id.slice(0, 8)}`);
  const room = () => width - lead - 4 - (right ? visibleWidth(right) + 3 : 1);
  if (room() < MIN_DESCRIPTION_WIDTH) right = "";
  const title = (text: string) => theme.fg("toolTitle", theme.bold(text));
  // The ellipsis carries its own style: truncation resets the styles before it.
  const text = truncateToWidth(
    title(compactDisplayText(description)),
    Math.max(1, room()),
    title("…")
  );
  const tail = right ? ` ${theme.fg("dim", right)} ${border("─")}` : border("─");
  const fill = Math.max(1, width - lead - visibleWidth(text) - 1 - visibleWidth(tail));
  const color = kind === "task" ? "accent" : "bashMode";

  return truncateToWidth(
    `${border("─ ")}${theme.inverse(theme.fg(color, theme.bold(chip)))} ${text} ${border(
      "─".repeat(fill)
    )}${tail}`,
    width,
    ""
  );
}

/** A labelled metadata row. Empty values are left out, and a row without values is hidden. */
export type MetadataRow = {
  label: string;
  values: string[];
  /** Joins values on one row; without it, each value starts a row. */
  separator?: string;
  /** Gives the label the error colour. */
  error?: boolean;
};

/** Values on rows of `width`, broken only between values, so no separator ends a row. */
function pack(values: readonly string[], separator: string | undefined, width: number): string[] {
  const rows: string[] = [];
  let row = "";

  for (const value of values) {
    if (row && separator && visibleWidth(row + separator + value) <= width) {
      row += separator + value;
      continue;
    }

    if (row) rows.push(row);
    // A value wider than the column wraps on its own rows.
    const wrapped = wrapRows(value, width);
    row = wrapped.pop() ?? "";
    // A spread could exceed the argument limit for a long command in a narrow column.
    for (const line of wrapped) rows.push(line);
  }

  if (row) rows.push(row);

  return rows;
}

/**
 * Label/value rows with one dim label column. Long values wrap under the value column. When the
 * column leaves no room for a wide character, each label stands above its values, as on the cards.
 */
function metadataTable(theme: Theme, rows: readonly MetadataRow[], width: number): string[] {
  const shown = rows
    .map((row) => ({ ...row, values: row.values.filter(Boolean) }))
    .filter((row) => row.values.length);
  const column = Math.max(0, ...shown.map((row) => visibleWidth(row.label)));
  const indent = " ".repeat(column + 3);
  const stacked = width - indent.length < 2;
  const room = stacked ? width : width - indent.length;

  return shown.flatMap(({ label, values, separator, error }) => {
    const name = (text: string) => theme.fg(error ? "error" : "dim", text);
    const packed = pack(values, separator && theme.fg("dim", separator), room);
    if (stacked) return [...wrapRows(name(label), width), ...packed];

    return packed.map((value, index) =>
      index ? `${indent}${value}` : ` ${name(label.padEnd(column))}  ${value}`
    );
  });
}

/**
 * The spinner and elapsed time while active; then the outcome glyph and word, with the duration
 * when the run has an end, such as `✓ completed in 1m 12s`.
 */
function statusValue(
  theme: Theme,
  record: TaskRecord | JobRecord,
  background: boolean,
  frame: string | undefined
): string {
  const outcome = record.state === "inactive" ? record.outcome : null;
  const { glyph, color } = status({ state: record.state, outcome, background });
  if (record.state === "active")
    return theme.fg(color, `${frame ?? glyph} ${elapsed(record.started_at, null)}`);
  const time =
    record.ended_at === null
      ? ""
      : ` ${record.outcome === "completed" ? "in" : "after"} ${elapsed(record.started_at, record.ended_at)}`;

  return theme.fg(color, `${glyph} ${record.outcome}${time}`);
}

/**
 * A task viewer's `status`, `model`, `usage`, and `error` rows. `parent` is the listed task that
 * launched a descendant. Usage has the format of Pi's token and context widgets.
 */
export function taskRows(
  theme: Theme,
  record: TaskRecord,
  parent: TaskRecord | undefined,
  frame: string | undefined
): MetadataRow[] {
  const { context } = record;
  let mode = "";
  if (record.state === "active")
    mode = record.background ? theme.fg("warning", "background") : theme.fg("muted", "foreground");
  const share =
    context && context.tokens !== null
      ? ` (${((context.tokens / context.window) * 100).toFixed(1)}%)`
      : "";

  return [
    {
      label: "status",
      separator: " · ",
      values: [
        statusValue(theme, record, record.background, frame),
        mode,
        parent ? `${theme.fg("dim", "launched by")} ${compactDisplayText(parent.description)}` : ""
      ]
    },
    {
      label: "model",
      separator: " · ",
      values: [
        compactDisplayText(record.model),
        `${theme.fg("dim", "thinking")} ${compactDisplayText(record.thinking)}`
      ]
    },
    {
      label: "usage",
      separator: " • ",
      values: [usageParts(record, true).join(" "), `${contextLabel(record)}${share}`]
    },
    { label: "error", error: true, values: [compactDisplayText(record.error ?? "")] }
  ];
}

/**
 * A job viewer's `status`, `command`, `log`, and `error` rows. `command` holds the display lines
 * of the command. The error shows only when it adds to the exit code.
 */
export function jobRows(
  theme: Theme,
  record: JobRecord,
  command: readonly string[],
  frame: string | undefined
): MetadataRow[] {
  let exit = "";
  let error = "";

  if (record.state === "inactive") {
    const code = record.exit_code;
    exit = `${theme.fg("dim", "exit code")} ${code === null ? theme.fg("dim", "none") : code}`;
    if (record.error !== `exit code ${code}`) error = compactDisplayText(record.error ?? "");
  }

  return [
    {
      label: "status",
      separator: " · ",
      values: [statusValue(theme, record, true, frame), exit]
    },
    { label: "command", values: command.map((line) => theme.fg("mdCode", `$ ${line}`)) },
    { label: "log", values: [compactDisplayText(record.log_file)] },
    { label: "error", error: true, values: [error] }
  ];
}

/** A viewer's rows around its body, each already fitted to the width. */
type ViewerParts = {
  title: string;
  metadata: readonly string[];
  diagnostics: readonly string[];
  hints: readonly string[];
};

/**
 * Fits a viewer in `rows`. The title, the two overflow borders, one body row, and the first hint
 * row, which starts with `Esc back`, come first. Then diagnostics, metadata rows from the top,
 * the other hint rows, and a blank row above the footer take the free rows in that order. The
 * body takes `height`, the rows that remain.
 */
function fitViewer(
  rows: number,
  { title, metadata, diagnostics, hints }: ViewerParts
): { header: string[]; footer: string[]; height: number } {
  let free = Math.max(0, rows - 4);

  const take = (list: readonly string[]) => {
    const taken = list.slice(0, free);
    free -= taken.length;

    return taken;
  };

  const first = take(hints.slice(0, 1));
  const shown = take(diagnostics);
  const header = [title, ...take(metadata)];
  const rest = take(hints.slice(1));
  const footer = [...take([""]), ...shown, ...first, ...rest];

  return { header, footer, height: Math.max(0, rows - 2 - header.length - footer.length) };
}

/** A viewer's body rows at its height, and the numbers of rows hidden above and below them. */
export type ViewerBody = { lines: string[]; above: number; below: number };

/** A task or job viewer; each view supplies its body and its hints. */
export type ViewerFrame = {
  tui: TUI;
  theme: Theme;
  width: number;
  kind: "task" | "job";
  /** The viewed task or job; without one, a plain border is the title and no metadata shows. */
  subject: { description: string; id: string; metadata: readonly MetadataRow[] } | undefined;
  /** Error texts above the hints. */
  diagnostics: readonly string[];
  /** The first hint is `Esc back`. */
  hints: readonly string[];
  body: (height: number) => ViewerBody;
};

/**
 * A viewer in three quarters of the terminal's rows, or all of them in fullscreen mode: the
 * header, the body between its overflow borders, and the footer. `bodyTop` is the body's first row.
 */
export function renderViewer({
  tui,
  theme,
  width,
  kind,
  subject,
  diagnostics,
  hints,
  body
}: ViewerFrame): { rows: string[]; bodyTop: number } {
  const rows = Math.max(1, Math.floor(tui.terminal.rows * (tui.mode === "fullscreen" ? 1 : 3 / 4)));
  const { header, footer, height } = fitViewer(rows, {
    title: subject
      ? titleBorder(theme, kind, subject.description, subject.id, width)
      : theme.fg("border", "─".repeat(width)),
    metadata: subject ? metadataTable(theme, subject.metadata, width) : [],
    diagnostics: diagnostics.map((text) => theme.fg("error", compactDisplayText(text))),
    hints: renderHintFooter({
      width,
      maxRows: rows,
      hints,
      padding: "",
      separator: " · ",
      style: (text) => theme.fg("dim", text)
    })
  });
  const { lines, above, below } = body(height);
  const padding = Array.from({ length: Math.max(0, height - lines.length) }, () => "");
  const color = (text: string) => theme.fg("border", text);

  return {
    rows: [
      ...header,
      renderOverflowBorder(width, { color, direction: "↑", hidden: above }),
      ...lines,
      ...padding,
      ...footer,
      renderOverflowBorder(width, { color, direction: "↓", hidden: below })
    ]
      .slice(0, rows)
      .map((row) => truncateToWidth(row, width, "")),
    bodyTop: header.length + 1
  };
}
