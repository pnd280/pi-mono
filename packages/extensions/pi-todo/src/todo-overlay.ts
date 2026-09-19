import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import { MAX_WIDGET_LINES, WIDGET_KEY } from "./constants.ts";
import type { TodoController } from "./controller.ts";
import {
  statusGlyph,
  TASK_STATUS_COLOR,
  TODO_DEPENDENCY_GLYPH,
  TODO_TREE_GLYPH
} from "./glyphs.ts";
import {
  deriveTaskHierarchy,
  projectTaskTreeEntries,
  type TaskHierarchyEntry,
  type TaskTreeEntry
} from "./hierarchy.ts";
import { presentCompactTaskText } from "./text.ts";
import type { Task, TaskStatus } from "./types.ts";

type WidgetSuppression = {
  release(): void;
};

export type TodoWidgetTheme = Pick<Theme, "fg" | "strikethrough">;

export type TodoWidgetTui = Pick<TUI, "requestRender">;

export type TodoWidgetFactory = (tui: TodoWidgetTui, theme: TodoWidgetTheme) => Component;

export type TodoOverlayUI = {
  setWidget(
    key: string,
    content: TodoWidgetFactory | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" }
  ): void;
  setActivity(text?: string): void;
};

export type TodoWidgetStateControl = {
  setCollapsed(collapsed: boolean): boolean;
  toggleCollapsed(): boolean;
};

export type BuildTodoWidgetLinesOptions = {
  collapsed?: boolean;
};

export class TodoOverlay {
  private tui: TodoWidgetTui | undefined;
  private uiCtx: TodoOverlayUI | undefined;
  private widgetRegistered = false;
  private collapsed = false;
  private live = false;
  private generation = 0;
  private registrationEpoch = 0;
  private todos: readonly Task[] = [];
  private todosRevision = -1;
  private dataVersion = 0;
  private readonly suppressions = new Set<symbol>();

  constructor(private readonly controller: Pick<TodoController, "getTodos" | "getRevision">) {}

  setUICtx(ctx: TodoOverlayUI): void {
    if (ctx === this.uiCtx && this.live) return;

    this.clearRegisteredWidget();
    this.uiCtx?.setActivity();
    this.uiCtx = ctx;
    this.live = true;
    this.generation += 1;
    this.todosRevision = -1;
    this.suppressions.clear();
  }

  setCollapsed(collapsed: boolean): boolean {
    this.collapsed = collapsed;
    this.update();

    return this.collapsed;
  }

  toggleCollapsed(): boolean {
    return this.setCollapsed(!this.collapsed);
  }

  update(): void {
    if (!this.live || !this.uiCtx) return;

    const hierarchy = deriveTaskHierarchy(this.refreshTodos());
    const entries = hierarchy?.entries ?? [];
    this.syncWorkingMessage(entries);

    const hasVisibleTasks = entries.some((entry) => entry.task.status !== "deleted");

    if (!hasVisibleTasks || this.suppressions.size > 0) {
      this.clearRegisteredWidget();

      return;
    }

    if (!this.widgetRegistered) {
      const registrationGeneration = this.generation;
      const registrationEpoch = ++this.registrationEpoch;
      // Pi constructs widget factories synchronously inside setWidget().
      this.widgetRegistered = true;
      this.uiCtx.setWidget(
        WIDGET_KEY,
        (tui, theme) => {
          if (
            this.live &&
            this.widgetRegistered &&
            registrationGeneration === this.generation &&
            registrationEpoch === this.registrationEpoch
          ) {
            this.tui = tui;
          }

          let cache: { key: string; lines: string[] } | undefined;

          return {
            render: (width: number) => {
              const key = `${this.dataVersion}|${this.collapsed}|${width}`;

              if (cache?.key !== key) {
                cache = {
                  key,
                  lines: buildTodoWidgetLines(this.refreshTodos(), theme, width, {
                    collapsed: this.collapsed
                  })
                };
              }

              return cache.lines;
            },
            // Theme invalidation clears cached ANSI so the next render restyles.
            invalidate: () => {
              cache = undefined;
            }
          } satisfies Component;
        },
        { placement: "aboveEditor" }
      );

      return;
    }

    this.tui?.requestRender();
  }

  suppress(): WidgetSuppression {
    const token = Symbol("todo-widget-suppression");
    const generation = this.generation;
    let released = false;
    this.suppressions.add(token);
    this.clearRegisteredWidget();

    return {
      release: () => {
        if (released) return;
        released = true;
        if (generation !== this.generation || !this.suppressions.delete(token)) return;
        if (this.suppressions.size === 0 && this.live) this.update();
      }
    };
  }

  dispose(): void {
    this.live = false;
    this.generation += 1;
    this.suppressions.clear();
    this.clearRegisteredWidget();
    this.uiCtx?.setActivity();
    this.uiCtx = undefined;
  }

  private clearRegisteredWidget(): void {
    this.registrationEpoch += 1;
    if (this.widgetRegistered && this.uiCtx) this.uiCtx.setWidget(WIDGET_KEY, undefined);
    this.widgetRegistered = false;
    this.tui = undefined;
  }

  /** Refresh the isolated presentation snapshot only when the controller changed. */
  private refreshTodos(): readonly Task[] {
    const revision = this.controller.getRevision();

    if (revision !== this.todosRevision) {
      this.todos = this.controller.getTodos();
      this.todosRevision = revision;
      this.dataVersion += 1;
    }

    return this.todos;
  }

  private syncWorkingMessage(entries: readonly TaskHierarchyEntry[]): void {
    if (!this.uiCtx) return;

    const inProgressEntries = entries.filter((entry) => entry.task.status === "in_progress");
    const firstInProgress = inProgressEntries[0]?.task;

    if (!this.collapsed || !firstInProgress) {
      this.uiCtx.setActivity();

      return;
    }

    const text =
      presentCompactTaskText(firstInProgress.inProgressLabel ?? "") ||
      presentCompactTaskText(firstInProgress.subject);

    if (!text) {
      this.uiCtx.setActivity();

      return;
    }

    const additionalCount = inProgressEntries.length - 1;
    this.uiCtx.setActivity(additionalCount > 0 ? `${text} (+${additionalCount} more)` : text);
  }
}

export function buildTodoWidgetLines(
  tasks: readonly Task[],
  theme: TodoWidgetTheme,
  width: number,
  options: BuildTodoWidgetLinesOptions = {}
): string[] {
  const hierarchy = deriveTaskHierarchy(tasks);
  if (!hierarchy) return [];
  const all = hierarchy.entries.filter((entry) => entry.task.status !== "deleted");
  if (all.length === 0) return [];
  if (!Number.isFinite(width) || width <= 0) return [""];

  const truncate = createWidgetTruncator(width);
  const completedCount = all.filter((entry) => entry.task.status === "completed").length;
  const totalVisible = all.length;
  let overallStatus: TaskStatus = all.some((entry) => entry.task.status === "pending")
    ? "pending"
    : "completed";
  if (all.some((entry) => entry.task.status === "in_progress")) overallStatus = "in_progress";
  const showIds = tasks.some(
    (task) => task.parentId !== undefined || (task.blockedBy?.length ?? 0) > 0
  );

  const heading = truncate(
    theme.fg(
      TASK_STATUS_COLOR[overallStatus],
      `${TUI_GLYPHS.taskStatus[overallStatus]} Todos (${completedCount}/${totalVisible} completed)`
    )
  );

  const lines: string[] = [heading];
  if (options.collapsed === true) return lines;

  const maxBody = MAX_WIDGET_LINES - 1;

  if (all.length <= maxBody) {
    for (const entry of projectTaskTreeEntries(all)) {
      lines.push(renderWidgetEntry({ entry, theme, showIds, truncate }));
    }

    return lines;
  }

  const visible = selectOverflowEntries(all, maxBody - 1);

  for (const entry of projectTaskTreeEntries(visible, { hasTrailingRoot: true })) {
    lines.push(renderWidgetEntry({ entry, theme, showIds, truncate }));
  }

  const visibleIds = new Set(visible.map((entry) => entry.task.id));
  const hidden = all.filter((entry) => !visibleIds.has(entry.task.id));
  const hiddenCompleted = hidden.filter((entry) => entry.task.status === "completed").length;
  const hiddenActive = hidden.length - hiddenCompleted;
  const overflowParts: string[] = [];
  if (hiddenCompleted > 0) overflowParts.push(`${hiddenCompleted} completed`);
  if (hiddenActive > 0) overflowParts.push(`${hiddenActive} active`);
  const overflowText = `+${hidden.length} more (${overflowParts.join(", ")})`;
  lines.push(
    truncate(`${theme.fg("dim", TODO_TREE_GLYPH.lastBranch)} ${theme.fg("dim", overflowText)}`)
  );

  return lines;
}

function selectOverflowEntries(
  entries: readonly TaskHierarchyEntry[],
  budget: number
): readonly TaskHierarchyEntry[] {
  const entryById = new Map(entries.map((entry) => [entry.task.id, entry]));
  const selectedIds = new Set<number>();
  const unfinished = [
    ...entries.filter((entry) => entry.task.status === "in_progress"),
    ...entries.filter((entry) => entry.task.status === "pending")
  ];
  const requiredIds = new Set<number>();

  for (const entry of unfinished) {
    for (const ancestorId of entry.ancestorIds) requiredIds.add(ancestorId);
    requiredIds.add(entry.task.id);
  }

  if (requiredIds.size <= budget) {
    for (const taskId of requiredIds) selectedIds.add(taskId);

    for (const entry of entries) {
      if (selectedIds.size >= budget) break;

      if (!selectedIds.has(entry.task.id)) {
        addCompletePath(entry, entryById, selectedIds, budget);
      }
    }
  } else {
    for (const entry of unfinished) {
      addCompletePath(entry, entryById, selectedIds, budget);
    }
  }

  return entries.filter((entry) => selectedIds.has(entry.task.id));
}

function addCompletePath(
  entry: TaskHierarchyEntry,
  entryById: ReadonlyMap<number, TaskHierarchyEntry>,
  selectedIds: Set<number>,
  budget: number
): void {
  const path = [...entry.ancestorIds, entry.task.id];
  const missing = path.filter((taskId) => entryById.has(taskId) && !selectedIds.has(taskId));
  if (selectedIds.size + missing.length > budget) return;
  for (const taskId of missing) selectedIds.add(taskId);
}

function renderWidgetEntry(input: {
  entry: TaskTreeEntry;
  theme: TodoWidgetTheme;
  showIds: boolean;
  truncate: (line: string) => string;
}): string {
  const { entry, theme, showIds, truncate } = input;
  const indentation = entry.ancestorHasFollowingSibling
    .map((hasFollowingSibling) =>
      hasFollowingSibling ? `${theme.fg("dim", TODO_TREE_GLYPH.guide)}  ` : "   "
    )
    .join("");
  const branch = entry.isLastSibling ? TODO_TREE_GLYPH.lastBranch : TODO_TREE_GLYPH.branch;

  return truncate(
    `${indentation}${theme.fg("dim", branch)} ${formatTaskLine(entry.task, theme, showIds)}`
  );
}

function formatTaskLine(task: Task, theme: TodoWidgetTheme, showId: boolean): string {
  const glyph = statusGlyph(task.status, theme);
  const subjectColor = task.status === "completed" || task.status === "deleted" ? "dim" : "text";
  let subject = theme.fg(subjectColor, presentCompactTaskText(task.subject) || "Untitled todo");

  if (task.status === "completed" || task.status === "deleted") {
    subject = theme.strikethrough(subject);
  }

  let line = glyph;
  if (showId) line += ` ${theme.fg("accent", `#${task.id}`)}`;
  line += ` ${subject}`;

  if (task.status === "in_progress" && task.inProgressLabel) {
    const inProgressLabel = presentCompactTaskText(task.inProgressLabel);

    if (inProgressLabel) {
      line += ` ${theme.fg("dim", `(${inProgressLabel})`)}`;
    }
  }

  if (task.blockedBy && task.blockedBy.length > 0) {
    line += ` ${theme.fg("dim", `${TODO_DEPENDENCY_GLYPH} ${task.blockedBy.map((id) => `#${id}`).join(",")}`)}`;
  }

  return line;
}

function createWidgetTruncator(width: number): (line: string) => string {
  const safeWidth = Math.max(1, Math.floor(width));

  return (line) => truncateToWidth(line, safeWidth);
}
