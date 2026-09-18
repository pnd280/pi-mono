import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  type Component,
  type KeybindingsManager,
  type TUI
} from "@earendil-works/pi-tui";
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";

import { formatEmptyTodosMessage, formatTodosSummary } from "./format.ts";
import { statusGlyph, TASK_STATUS_TEXT } from "./glyphs.ts";
import { deriveTaskHierarchy, projectTaskTreeEntries, type TaskTreeEntry } from "./hierarchy.ts";
import { taskDetailResultText } from "./reducer.ts";
import { presentCompactTaskText, presentTaskDescription } from "./text.ts";
import type { Task } from "./types.ts";

type ViewOptions = {
  tasks: readonly Task[];
  theme: Pick<Theme, "fg" | "bold" | "strikethrough">;
  tui: Pick<TUI, "mode" | "requestRender"> & { terminal: { rows: number } };
  keybindings: Pick<KeybindingsManager, "getKeys" | "matches">;
  done(): void;
};

type ListLayout = {
  width: number;
  rows: readonly (readonly string[])[];
  rowStart: readonly number[];
  totalRows: number;
};

/** Host row counts are coerced directly; the value is host-provided, not untrusted input. */
function normalizeRows(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 24;
}

/** Index of the entry whose row range contains `row`, or the nearest earlier entry. */
function firstEntryAtOrBefore(rowStart: readonly number[], row: number): number {
  let low = 0;
  let high = rowStart.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((rowStart[middle] ?? 0) <= row) low = middle + 1;
    else high = middle;
  }

  return Math.max(0, low - 1);
}

function clampScroll(scroll: number, totalRows: number, capacity: number): number {
  return Math.max(0, Math.min(scroll, Math.max(0, totalRows - capacity)));
}

/** Todo routes and selection policy; shared helpers own wrapping and hint layout. */
export class TodosView implements Component {
  private selected = 0;
  private detail = false;
  private scroll = 0;
  private bodyLength = 0;
  private readonly entries: readonly TaskTreeEntry[];
  private readonly summary: string;
  private listLayout: ListLayout | undefined;
  private detailRows: { width: number; taskId: number; rows: string[] } | undefined;

  constructor(private readonly options: ViewOptions) {
    this.entries = projectTaskTreeEntries(
      deriveTaskHierarchy(options.tasks)?.entries.filter(
        (entry) => entry.task.status !== "deleted"
      ) ?? []
    );
    this.summary = formatTodosSummary(options.tasks);
  }

  private layout() {
    const rows = normalizeRows(this.options.tui.terminal.rows);
    const reserve =
      this.options.tui.mode === "fullscreen"
        ? Math.min(4, Math.floor(rows / 4), Math.max(0, rows - 8))
        : 0;
    const budget = rows - reserve;
    const hasEntries = this.entries.length > 0;
    const hints = budget >= 3,
      title = budget >= 5,
      borders = budget >= 7,
      summary = budget >= 8 && hasEntries;

    return {
      rows,
      hints,
      title,
      borders,
      summary,
      capacity: Math.min(
        16,
        Math.max(
          1,
          budget - Number(hints) * 2 - Number(title) * 2 - Number(borders) * 2 - Number(summary)
        )
      )
    };
  }

  render(width: number): string[] {
    const layout = this.layout();
    if (!layout.rows) return [];
    if (!Number.isFinite(width) || width <= 0) return [""];
    width = Math.max(1, Math.floor(width));
    const { theme } = this.options;
    const selected = this.entries[this.selected]?.task;
    const body = this.bodyLines(width, layout.capacity);
    const border = theme.fg("border", "─".repeat(width));
    const hints = this.footerHints(this.bodyLength, layout.capacity);

    return [
      ...(layout.borders ? [border] : []),
      ...(layout.title
        ? [theme.fg("accent", theme.bold(this.detail ? "Todo detail" : "Todos")), ""]
        : []),
      ...(layout.summary
        ? [
            theme.fg(
              "dim",
              `${this.detail ? "" : this.summary}${selected ? ` · #${selected.id}` : ""}`
            )
          ]
        : []),
      ...body,
      ...(layout.hints
        ? [
            "",
            ...renderHintFooter({
              width,
              maxRows: 1,
              hints,
              padding: "",
              separator: " · ",
              style: (text) => theme.fg("dim", text)
            }).rows
          ]
        : []),
      ...(layout.borders ? [border] : [])
    ].map((line) => truncateToWidth(line, width));
  }

  private bodyLines(width: number, capacity: number): string[] {
    const selected = this.entries[this.selected]?.task;

    if (this.detail && selected) return this.detailBody(width, capacity, selected);

    return this.listBody(width, capacity);
  }

  /** Detail text only changes with the selected task, so cache wrapped rows by width. */
  private detailBody(width: number, capacity: number, task: Task): string[] {
    let cached = this.detailRows;

    if (!cached || cached.width !== width || cached.taskId !== task.id) {
      const detail = taskDetailResultText(this.options.tasks, {
        ...task,
        subject: presentCompactTaskText(task.subject),
        ...(task.description === undefined
          ? {}
          : { description: presentTaskDescription(task.description) })
      });
      cached = { width, taskId: task.id, rows: wrapRows(detail, width) };
      this.detailRows = cached;
    }

    const rows = cached.rows;
    this.bodyLength = rows.length;
    this.scroll = clampScroll(this.scroll, rows.length, capacity);

    return rows.slice(this.scroll, this.scroll + capacity);
  }

  private listBody(width: number, capacity: number): string[] {
    const layout = this.listRows(width);
    this.bodyLength = layout.totalRows;

    if (layout.totalRows === 0) {
      this.scroll = 0;

      return wrapRows(formatEmptyTodosMessage(), width);
    }

    const selectedRow = layout.rowStart[this.selected];

    if (selectedRow !== undefined) {
      if (selectedRow < this.scroll) this.scroll = selectedRow;
      else if (selectedRow >= this.scroll + capacity) this.scroll = selectedRow - capacity + 1;
    }

    this.scroll = clampScroll(this.scroll, layout.totalRows, capacity);

    return this.visibleRows(layout, width, capacity);
  }

  private listRows(width: number): ListLayout {
    const cached = this.listLayout;
    if (cached?.width === width) return cached;
    const rows: string[][] = [];
    const rowStart: number[] = [];
    let totalRows = 0;

    for (const entry of this.entries) {
      const entryRows = this.entryRows(entry, width, " ");
      rowStart.push(totalRows);
      rows.push(entryRows);
      totalRows += entryRows.length;
    }

    const layout: ListLayout = { width, rows, rowStart, totalRows };
    this.listLayout = layout;

    return layout;
  }

  /** Materialize only the entries intersecting the viewport so selection stays cheap. */
  private visibleRows(layout: ListLayout, width: number, capacity: number): string[] {
    const start = this.scroll;
    const end = Math.min(layout.totalRows, start + capacity);
    const rows: string[] = [];
    const first = firstEntryAtOrBefore(layout.rowStart, start);

    for (let index = first; index < this.entries.length; index += 1) {
      const entryStart = layout.rowStart[index];
      const entry = this.entries[index];

      if (entryStart === undefined || entry === undefined || entryStart >= end) break;
      const entryRows =
        index === this.selected ? this.entryRows(entry, width, ">") : (layout.rows[index] ?? []);
      const from = Math.max(0, start - entryStart);
      const to = Math.min(entryRows.length, end - entryStart);

      for (let row = from; row < to; row += 1) {
        const line = entryRows[row];
        if (line !== undefined) rows.push(line);
      }
    }

    return rows;
  }

  private entryRows(entry: TaskTreeEntry, width: number, marker: string): string[] {
    const { theme } = this.options;
    const task = entry.task;
    const tree =
      entry.ancestorHasFollowingSibling.map((next) => (next ? "│  " : "   ")).join("") +
      (entry.isLastSibling ? "└─" : "├─");
    let subject = presentCompactTaskText(task.subject) || "Untitled todo";

    if (task.status === "completed") subject = theme.strikethrough(subject);
    const label =
      task.status === "in_progress" && task.inProgressLabel
        ? ` (${presentCompactTaskText(task.inProgressLabel)})`
        : "";
    const dependencies =
      task.blockedBy !== undefined && task.blockedBy.length > 0
        ? ` ⊣ ${task.blockedBy.map((id) => `#${id}`).join(",")}`
        : "";

    return wrapRows(
      `${marker} ${tree} ${statusGlyph(task.status, theme)} ${TASK_STATUS_TEXT[task.status]} · #${task.id} ${subject}${label}${dependencies}`,
      width
    );
  }

  private footerHints(bodyLength: number, capacity: number): string[] {
    const hints = this.detail
      ? [
          `${this.keyHint("tui.select.up")}/${this.keyHint("tui.select.down")} scroll`,
          `${this.keyHint("tui.select.cancel")} back`
        ]
      : [
          `${this.keyHint("tui.select.up")}/${this.keyHint("tui.select.down")} select`,
          `${this.keyHint("tui.select.confirm")} details`,
          `${this.keyHint("tui.select.cancel")} close`
        ];
    if (bodyLength > capacity)
      hints.splice(1, 0, `${this.pageKeys(-1).join("/")}/${this.pageKeys(1).join("/")} page`);

    return hints;
  }

  handleInput(data: string): void {
    const keys = this.options.keybindings;

    if (
      keys
        .getKeys("tui.select.cancel")
        .filter((key) => key !== "ctrl+c")
        .some((key) => matchesKey(data, key))
    ) {
      if (this.detail) {
        this.detail = false;
        this.scroll = 0;
        this.options.tui.requestRender();
      } else this.options.done();

      return;
    }

    if (!this.detail && keys.matches(data, "tui.select.confirm") && this.entries[this.selected]) {
      this.detail = true;
      this.scroll = 0;
    } else {
      const delta = this.navigationDelta(data);
      if (!delta) return;
      if (this.detail)
        this.scroll = Math.max(
          0,
          Math.min(this.scroll + delta, this.bodyLength - this.layout().capacity)
        );
      else this.selected = Math.max(0, Math.min(this.entries.length - 1, this.selected + delta));
    }

    this.options.tui.requestRender();
  }

  private navigationDelta(data: string): number {
    const keys = this.options.keybindings;
    if (keys.matches(data, "tui.select.up")) return -1;
    if (keys.matches(data, "tui.select.down")) return 1;
    const page = Math.max(1, this.layout().capacity - 1);
    if (this.pageKeys(-1).some((key) => matchesKey(data, key))) return -page;
    if (this.pageKeys(1).some((key) => matchesKey(data, key))) return page;

    return 0;
  }

  private pageKeys(direction: -1 | 1) {
    const suffix = direction === -1 ? "pageUp" : "pageDown";

    return this.options.keybindings.getKeys(`tui.select.${suffix}`);
  }

  private keyHint(
    action: "tui.select.up" | "tui.select.down" | "tui.select.cancel" | "tui.select.confirm"
  ) {
    return (
      this.options.keybindings
        .getKeys(action)
        .filter((key) => key !== "ctrl+c")
        .join("/") || "unbound"
    );
  }

  invalidate(): void {
    this.listLayout = undefined;
    this.detailRows = undefined;
  }
}
