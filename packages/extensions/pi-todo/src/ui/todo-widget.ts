import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  type Component,
  type TUI,
  type TuiMode,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import type { TodoController } from "../state/controller.ts";
import {
  deriveTaskHierarchy,
  projectTaskTreeEntries,
  type TaskHierarchyEntry,
  type TaskTreeEntry
} from "../state/hierarchy.ts";
import type { Task, TaskStatus } from "../state/model.ts";
import { presentCompactTaskText } from "../text.ts";
import { formatTaskLine, TASK_STATUS_COLOR, TODO_TREE_GLYPH } from "./task-presentation.ts";

const WIDGET_KEY = "pi-todo";

const MAX_WIDGET_LINES = 12;

type WidgetSuppression = {
  release(): void;
};

export type TodoWidgetTheme = Pick<Theme, "fg" | "strikethrough">;

export type TodoWidgetTui = Pick<TUI, "requestRender" | "mode">;

export type TodoWidgetFactory = (tui: TodoWidgetTui, theme: TodoWidgetTheme) => Component;

export type TodoWidgetUI = {
  setWidget(
    key: string,
    content: TodoWidgetFactory | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" }
  ): void;
  setActivity(text?: string): void;
};

type TodoWidgetRenderOptions = {
  collapsed?: boolean;
};

export class TodoWidget {
  private tui: TodoWidgetTui | undefined;
  private uiCtx: TodoWidgetUI | undefined;
  private widgetRegistered = false;
  private collapsed = false;
  /** Last mode seen through Pi's live TUI reference; collapse applies only in fullscreen. */
  private tuiMode: TuiMode | undefined;
  private live = false;
  private generation = 0;
  private registrationEpoch = 0;
  private presentation:
    | { revision: number; snapshot: ReturnType<typeof prepareTodoPresentation> }
    | undefined;
  private readonly suppressions = new Set<symbol>();

  constructor(private readonly controller: Pick<TodoController, "getTodos" | "getRevision">) {}

  setUICtx(ctx: TodoWidgetUI): void {
    if (ctx === this.uiCtx && this.live) return;

    this.clearRegisteredWidget();
    this.uiCtx?.setActivity();
    this.uiCtx = ctx;
    this.live = true;
    this.generation += 1;
    this.presentation = undefined;
    this.tuiMode = undefined;
    this.suppressions.clear();
  }

  /** Regular mode always shows the expanded widget; an unknown mode keeps the preference latent. */
  canCollapse(): boolean {
    return this.tuiMode !== "regular";
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

    const { snapshot } = this.refreshPresentation();
    this.syncWorkingMessage();

    if (!snapshot || this.suppressions.size > 0) {
      this.clearRegisteredWidget();

      return;
    }

    if (!this.widgetRegistered) {
      const registrationEpoch = ++this.registrationEpoch;
      // Pi constructs widget factories synchronously inside setWidget().
      this.widgetRegistered = true;
      this.uiCtx.setWidget(
        WIDGET_KEY,
        (tui, theme) => {
          const isCurrent = () =>
            this.live && this.widgetRegistered && registrationEpoch === this.registrationEpoch;

          if (isCurrent()) {
            this.tui = tui;
            this.observeMode(tui.mode);
          }

          let cache: { key: string; lines: string[] } | undefined;

          return {
            render: (width: number) => {
              const { revision, snapshot } = this.refreshPresentation();
              if (isCurrent()) this.observeMode(tui.mode);
              const collapsed = this.collapsed && tui.mode === "fullscreen";
              const key = `${revision}|${collapsed}|${width}`;

              if (cache?.key !== key) {
                cache = {
                  key,
                  lines: snapshot?.render(theme, width, { collapsed }) ?? []
                };
              }

              return cache.lines;
            },
            handleMouse: (event: TuiMouseEvent) => {
              if (
                event.type !== "click" ||
                event.button !== "left" ||
                tui.mode !== "fullscreen" ||
                !isCurrent()
              ) {
                return undefined;
              }

              this.toggleCollapsed();

              return { handled: true };
            },
            // Theme and TUI-mode switches invalidate; clear cached ANSI and pick up the new mode.
            invalidate: () => {
              cache = undefined;
              if (isCurrent()) this.observeMode(tui.mode);
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
    this.suppressions.add(token);
    this.clearRegisteredWidget();

    return {
      release: () => {
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

  /** Prepare both outputs together, without retaining the full raw task snapshot. */
  private refreshPresentation() {
    const revision = this.controller.getRevision();
    const cached = this.presentation;
    if (cached?.revision === revision) return cached;
    const presentation = {
      revision,
      snapshot: prepareTodoPresentation(this.controller.getTodos())
    };
    this.presentation = presentation;

    return presentation;
  }

  private observeMode(mode: TuiMode): void {
    if (mode === this.tuiMode) return;

    this.tuiMode = mode;
    this.syncWorkingMessage();
  }

  private syncWorkingMessage(): void {
    if (!this.uiCtx) return;

    this.uiCtx.setActivity(
      this.collapsed && this.tuiMode === "fullscreen"
        ? this.refreshPresentation().snapshot?.activity
        : undefined
    );
  }
}

/** Own hierarchy selection and activity; styling and width stay live at render time. */
function prepareTodoPresentation(tasks: readonly Task[]) {
  const hierarchy = deriveTaskHierarchy(tasks);
  if (!hierarchy) return undefined;
  const all = hierarchy.entries.filter((entry) => entry.task.status !== "deleted");
  if (all.length === 0) return undefined;

  const completedCount = all.filter((entry) => entry.task.status === "completed").length;
  const totalVisible = all.length;
  const inProgress = all.filter((entry) => entry.task.status === "in_progress");
  let overallStatus: TaskStatus = all.some((entry) => entry.task.status === "pending")
    ? "pending"
    : "completed";
  if (inProgress.length > 0) overallStatus = "in_progress";
  const showIds = tasks.some(
    (task) => task.parentId !== undefined || (task.blockedBy?.length ?? 0) > 0
  );
  const firstActive = inProgress[0]?.task;
  const activeText = firstActive
    ? presentCompactTaskText(firstActive.inProgressLabel ?? "") ||
      presentCompactTaskText(firstActive.subject)
    : "";
  let activity = activeText || undefined;
  if (activity && inProgress.length > 1) activity += ` (+${inProgress.length - 1} more)`;
  const maxBody = MAX_WIDGET_LINES - 1;
  const overflowing = all.length > maxBody;
  const visible = overflowing ? selectOverflowEntries(all, maxBody - 1) : all;
  const visibleIds = new Set(visible.map((entry) => entry.task.id));
  const hidden = all.filter((entry) => !visibleIds.has(entry.task.id));
  const hiddenCompleted = hidden.filter((entry) => entry.task.status === "completed").length;
  const hiddenActive = hidden.length - hiddenCompleted;
  const overflowParts: string[] = [];
  if (hiddenCompleted > 0) overflowParts.push(`${hiddenCompleted} completed`);
  if (hiddenActive > 0) overflowParts.push(`${hiddenActive} active`);
  const overflowText = `+${hidden.length} more (${overflowParts.join(", ")})`;

  // Retain only selected presentation fields, not descriptions or metadata.
  const entries = projectTaskTreeEntries(visible, { hasTrailingRoot: overflowing }).map((entry) => {
    const task: Task = {
      id: entry.task.id,
      subject: presentCompactTaskText(entry.task.subject),
      status: entry.task.status
    };

    if (entry.task.inProgressLabel !== undefined) {
      task.inProgressLabel = presentCompactTaskText(entry.task.inProgressLabel);
    }

    if (entry.task.blockedBy !== undefined) task.blockedBy = [...entry.task.blockedBy];

    return { ...entry, task };
  });

  return {
    activity,
    render(theme: TodoWidgetTheme, width: number, options: TodoWidgetRenderOptions = {}): string[] {
      if (!Number.isFinite(width) || width <= 0) return [""];
      const safeWidth = Math.max(1, Math.floor(width));
      const truncate = (line: string) => truncateToWidth(line, safeWidth);
      const lines = [
        truncate(
          theme.fg(
            TASK_STATUS_COLOR[overallStatus],
            `${TUI_GLYPHS.taskStatus[overallStatus]} Todos (${completedCount}/${totalVisible} completed)`
          )
        )
      ];
      if (options.collapsed === true) return lines;

      for (const entry of entries) {
        lines.push(renderWidgetEntry({ entry, theme, showIds, truncate }));
      }

      if (overflowing) {
        lines.push(
          truncate(
            `${theme.fg("dim", TODO_TREE_GLYPH.lastBranch)} ${theme.fg("dim", overflowText)}`
          )
        );
      }

      return lines;
    }
  };
}

function selectOverflowEntries(
  entries: readonly TaskHierarchyEntry[],
  budget: number
): readonly TaskHierarchyEntry[] {
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
        addCompletePath(entry, selectedIds, budget);
      }
    }
  } else {
    for (const entry of unfinished) {
      addCompletePath(entry, selectedIds, budget);
    }
  }

  return entries.filter((entry) => selectedIds.has(entry.task.id));
}

function addCompletePath(
  entry: TaskHierarchyEntry,
  selectedIds: Set<number>,
  budget: number
): void {
  const path = [...entry.ancestorIds, entry.task.id];
  const missing = path.filter((taskId) => !selectedIds.has(taskId));
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
    `${indentation}${theme.fg("dim", branch)} ${formatTaskLine(entry.task, theme, { showId: showIds })}`
  );
}
