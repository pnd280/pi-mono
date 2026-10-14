import { getSettingsListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  isKeyRelease,
  matchesKey,
  truncateToWidth,
  type Component,
  type KeybindingsManager,
  type KeyId,
  type TUI
} from "@earendil-works/pi-tui";
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";
import { renderOverflowBorder } from "@pi-mono/libs/tui/components/text-preview";
import { formatKeyLabel, navigationHints, resolveKeybindings } from "@pi-mono/libs/tui/keybindings";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";

import { formatEmptyTodosMessage } from "./format.ts";
import { statusGlyph, TODO_TREE_GLYPH } from "./glyphs.ts";
import { deriveTaskHierarchy, projectTaskTreeEntries, type TaskTreeEntry } from "./hierarchy.ts";
import { deriveBlocks } from "./reducer.ts";
import { formatTaskLine, formatTaskSubject } from "./task-presentation.ts";
import {
  formatTodosSummary,
  presentCompactTaskText,
  presentTaskDescription,
  TASK_STATUS_TEXT
} from "./text.ts";
import type { Task } from "./types.ts";

type ViewOptions = {
  tasks: readonly Task[];
  theme: Pick<Theme, "fg" | "bold" | "strikethrough">;
  tui: Pick<TUI, "requestRender"> & { terminal: { rows: number } };
  keybindings: Pick<KeybindingsManager, "getKeys">;
  done(): void;
};

type ListLayout = {
  width: number;
  rows: readonly (readonly string[])[];
  rowStart: readonly number[];
  totalRows: number;
};

type TodoAction = "cancel" | "confirm" | "up" | "down" | "pageUp" | "pageDown";

type TodoBinding = { action: TodoAction; key: KeyId };

type ViewLayout = {
  rows: number;
  title: boolean;
  borders: boolean;
  summary: boolean;
  capacity: number;
  footer: string[];
};

const configuredActions = [
  ["cancel", "tui.select.cancel"],
  ["confirm", "tui.select.confirm"],
  ["up", "tui.select.up"],
  ["down", "tui.select.down"],
  ["pageUp", "tui.select.pageUp"],
  ["pageDown", "tui.select.pageDown"]
] as const satisfies readonly [TodoAction, string][];

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
  private viewportCapacity = 1;
  private readonly entries: readonly TaskTreeEntry[];
  private readonly summary: string;
  private listLayout: ListLayout | undefined;
  private detailRows: { width: number; taskId: number; rows: string[] } | undefined;

  constructor(private readonly options: ViewOptions) {
    if (!this.keyLabel("cancel"))
      throw new Error(
        "Todo browser requires a cancel binding other than Ctrl+C. Fix tui.select.cancel and reload."
      );
    this.entries = projectTaskTreeEntries(
      deriveTaskHierarchy(options.tasks)?.entries.filter(
        (entry) => entry.task.status !== "deleted"
      ) ?? []
    );
    this.summary = formatTodosSummary(options.tasks);
  }

  private layout(width: number, bodyLength: number): ViewLayout {
    const rows = normalizeRows(this.options.tui.terminal.rows);
    // Leave room for Pi's footer in inline views.
    const reserve = Math.min(4, Math.floor(rows / 4), Math.max(0, rows - 8));
    const budget = rows - reserve;
    const hasEntries = this.entries.length > 0;
    const hints = budget >= 3,
      title = budget >= 5,
      borders = budget >= 7,
      summary = budget >= 8 && hasEntries && !this.detail;
    const chromeRows = Number(title) * 2 + Number(borders) * 2 + Number(summary);
    // Keep one body row and the blank separator before the footer.
    const maxFooterRows = hints ? Math.max(1, budget - chromeRows - 2) : 0;
    let capacity = Math.min(16, Math.max(1, budget - chromeRows - (hints ? 2 : 0)));
    let footer: string[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const footerHints = this.footerHints(bodyLength, capacity);
      footer = hints
        ? renderHintFooter({
            width,
            maxRows: maxFooterRows,
            hints: footerHints,
            padding: "",
            separator: " · ",
            style: (text) => this.options.theme.fg("dim", text)
          })
        : [];
      const footerRows = footer.length ? footer.length + 1 : 0;
      const nextCapacity = Math.min(16, Math.max(1, budget - chromeRows - footerRows));
      if (nextCapacity === capacity) break;
      capacity = nextCapacity;
    }

    return { rows, title, borders, summary, capacity, footer };
  }

  render(width: number): string[] {
    if (!Number.isFinite(width) || width <= 0) return [""];
    width = Math.max(1, Math.floor(width));
    const bodyLength = this.measureBodyLength(width);
    const layout = this.layout(width, bodyLength);
    if (!layout.rows) return [];
    const { theme } = this.options;
    const selected = this.entries[this.selected]?.task;
    this.viewportCapacity = layout.capacity;
    const body = this.bodyLines(width, layout.capacity);
    const color = (text: string) => theme.fg("border", text);
    const above = this.scroll;
    const below = Math.max(0, this.bodyLength - this.scroll - layout.capacity);
    const topBorder = renderOverflowBorder(width, {
      color,
      direction: "↑",
      hidden: above
    });
    const bottomBorder = renderOverflowBorder(width, {
      color,
      direction: "↓",
      hidden: below
    });
    const summary = this.selectionSummary();

    return [
      ...(layout.borders ? [topBorder] : []),
      ...(layout.title
        ? [
            theme.fg(
              "accent",
              theme.bold(this.detail && selected ? `Todo #${selected.id}` : "Todos")
            ),
            ""
          ]
        : []),
      ...(layout.summary ? [theme.fg("dim", `${summary} · ${this.summary}`)] : []),
      ...body,
      ...(layout.footer.length ? ["", ...layout.footer] : []),
      ...(layout.borders ? [bottomBorder] : [])
    ].map((line) => truncateToWidth(line, width));
  }

  private measureBodyLength(width: number): number {
    const selected = this.entries[this.selected]?.task;
    if (this.detail && selected) return this.detailRowsFor(selected, width).length;

    const list = this.listRows(width);
    if (list.totalRows > 0) return list.totalRows;

    return this.emptyRows(width).length;
  }

  /** Indented and dimmed like the empty states of the shared browser. */
  private emptyRows(width: number): string[] {
    return wrapRows(this.options.theme.fg("dim", `  ${formatEmptyTodosMessage()}`), width);
  }

  private selectionSummary(): string {
    return this.entries.length ? `(${this.selected + 1}/${this.entries.length})` : "";
  }

  private bodyLines(width: number, capacity: number): string[] {
    const selected = this.entries[this.selected]?.task;

    if (this.detail && selected) return this.detailBody(width, capacity, selected);

    return this.listBody(width, capacity);
  }

  /** Detail text only changes with the selected todo, so cache wrapped rows by width. */
  private detailRowsFor(task: Task, width: number): string[] {
    let cached = this.detailRows;

    if (!cached || cached.width !== width || cached.taskId !== task.id) {
      cached = { width, taskId: task.id, rows: this.taskDetailRows(task, width) };
      this.detailRows = cached;
    }

    return cached.rows;
  }

  private detailBody(width: number, capacity: number, task: Task): string[] {
    const rows = this.detailRowsFor(task, width);
    this.bodyLength = rows.length;
    this.scroll = clampScroll(this.scroll, rows.length, capacity);

    return rows.slice(this.scroll, this.scroll + capacity);
  }

  private taskDetailRows(task: Task, width: number): string[] {
    const { theme } = this.options;
    const rows = [
      ...wrapRows(theme.bold(formatTaskSubject(task, theme)), width),
      ...wrapRows(
        `${statusGlyph(task.status, theme)} ${theme.fg("dim", TASK_STATUS_TEXT[task.status])}`,
        width
      )
    ];
    const description = presentTaskDescription(task.description ?? "");

    if (description.trim()) {
      rows.push(
        "",
        theme.fg("muted", theme.bold("Description")),
        ...wrapRows(theme.fg("text", description), width)
      );
    }

    const fields: [string, string][] = [];
    const owner = presentCompactTaskText(task.owner ?? "");
    const activity = presentCompactTaskText(task.inProgressLabel ?? "");
    if (owner) fields.push(["Owner", theme.fg("text", owner)]);
    if (activity) fields.push(["Activity", theme.fg("text", activity)]);

    const references = (label: string, ids: readonly number[]) => {
      if (ids.length) {
        fields.push([label, ids.map((id) => theme.fg("accent", `#${id}`)).join(", ")]);
      }
    };

    references("Parent", task.parentId === undefined ? [] : [task.parentId]);
    references(
      "Children",
      this.entries.filter((entry) => entry.task.parentId === task.id).map((entry) => entry.task.id)
    );
    references("Blocked by", task.blockedBy ?? []);
    references("Blocks", deriveBlocks(this.options.tasks).get(task.id) ?? []);

    if (fields.length) {
      rows.push("");

      for (const [label, value] of fields) {
        rows.push(...wrapRows(`${theme.fg("muted", `${label}:`)} ${value}`, width));
      }
    }

    return rows;
  }

  private listBody(width: number, capacity: number): string[] {
    const layout = this.listRows(width);
    this.bodyLength = layout.totalRows;

    if (layout.totalRows === 0) {
      this.scroll = 0;
      const rows = this.emptyRows(width);
      this.bodyLength = rows.length;

      return rows.slice(0, capacity);
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
      const entryRows = this.entryRows(entry, width, "  ");
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
        index === this.selected
          ? this.entryRows(entry, width, getSettingsListTheme().cursor)
          : (layout.rows[index] ?? []);
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
    const tree =
      entry.ancestorHasFollowingSibling
        .map((next) => (next ? `${TODO_TREE_GLYPH.guide}  ` : "   "))
        .join("") + (entry.isLastSibling ? TODO_TREE_GLYPH.lastBranch : TODO_TREE_GLYPH.branch);
    const content = formatTaskLine(entry.task, theme, { showId: true, showStatus: true });

    return wrapRows(`${marker}${theme.fg("dim", tree)} ${content}`, width);
  }

  private bindings(): TodoBinding[] {
    return resolveKeybindings(
      configuredActions.map(([action, id]) => ({
        action,
        keys: this.options.keybindings.getKeys(id),
        ...(action === "cancel" ? { exclude: (key: KeyId) => key === "ctrl+c" } : {})
      }))
    );
  }

  private keysFor(action: TodoAction): KeyId[] {
    return this.bindings()
      .filter((binding) => binding.action === action)
      .map((binding) => binding.key);
  }

  private actionFor(data: string): TodoAction | undefined {
    if (isKeyRelease(data)) return undefined;

    return this.bindings().find(({ key }) => matchesKey(data, key))?.action;
  }

  private keyLabel(action: TodoAction): string | undefined {
    const key = this.keysFor(action)[0];

    return key === undefined ? undefined : formatKeyLabel(key);
  }

  private keyHint(action: TodoAction, label: string): string {
    const key = this.keyLabel(action);

    return key ? `${key} ${label}` : `${label} unavailable`;
  }

  private footerHints(bodyLength: number, capacity: number): string[] {
    const arrows = navigationHints(
      this.keyLabel("up"),
      this.keyLabel("down"),
      this.detail ? "scroll" : "select"
    );
    const hints = this.detail
      ? [...arrows, this.keyHint("cancel", "back")]
      : [...arrows, this.keyHint("confirm", "details"), this.keyHint("cancel", "close")];

    if (bodyLength > capacity) {
      hints.push(...navigationHints(this.keyLabel("pageUp"), this.keyLabel("pageDown"), "page"));
    }

    return hints;
  }

  ownsFullscreenInput(data: string): boolean {
    const action = this.actionFor(data);

    return action === "pageUp" || action === "pageDown";
  }

  handleInput(data: string): void {
    const action = this.actionFor(data);

    if (action === "cancel") {
      if (this.detail) {
        this.detail = false;
        this.scroll = 0;
        this.options.tui.requestRender();
      } else this.options.done();

      return;
    }

    if (!this.detail && action === "confirm" && this.entries[this.selected]) {
      this.detail = true;
      this.scroll = 0;
    } else {
      const delta = this.navigationDelta(action);
      if (!delta) return;
      if (this.detail)
        this.scroll = Math.max(
          0,
          Math.min(this.scroll + delta, this.bodyLength - this.viewportCapacity)
        );
      else this.selected = Math.max(0, Math.min(this.entries.length - 1, this.selected + delta));
    }

    this.options.tui.requestRender();
  }

  private navigationDelta(action: TodoAction | undefined): number {
    if (action === "up") return -1;
    if (action === "down") return 1;
    const page = Math.max(1, this.viewportCapacity - 1);
    if (action === "pageUp") return -page;
    if (action === "pageDown") return page;

    return 0;
  }

  invalidate(): void {
    this.listLayout = undefined;
    this.detailRows = undefined;
  }
}
