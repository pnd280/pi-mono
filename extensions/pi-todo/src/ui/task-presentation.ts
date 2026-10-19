import type { Theme } from "@earendil-works/pi-coding-agent";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import type { Task, TaskStatus } from "../state/model.ts";
import { presentCompactTaskText, TASK_STATUS_TEXT } from "../text.ts";

type TaskTheme = Pick<Theme, "fg" | "strikethrough">;

export const TASK_STATUS_COLOR = {
  pending: "accent",
  in_progress: "accent",
  completed: "success",
  deleted: "muted"
} satisfies Record<TaskStatus, Parameters<Theme["fg"]>[0]>;

export const TODO_TREE_GLYPH = {
  guide: TUI_GLYPHS.tree.guide,
  branch: `${TUI_GLYPHS.tree.branch}${TUI_GLYPHS.tree.horizontal}`,
  lastBranch: `${TUI_GLYPHS.tree.lastBranch}${TUI_GLYPHS.tree.horizontal}`
};

const TODO_DEPENDENCY_GLYPH = "⊣";

export function statusGlyph(status: TaskStatus, theme: Pick<Theme, "fg">): string {
  return theme.fg(TASK_STATUS_COLOR[status], TUI_GLYPHS.taskStatus[status]);
}

export function formatTaskSubject(task: Task, theme: TaskTheme): string {
  const finished = task.status === "completed" || task.status === "deleted";
  const subject = theme.fg(
    finished ? "dim" : "text",
    presentCompactTaskText(task.subject) || "Untitled todo"
  );

  return finished ? theme.strikethrough(subject) : subject;
}

/** Keep widget and browser colors identical, with optional browser context. */
export function formatTaskLine(
  task: Task,
  theme: TaskTheme,
  options: { showId: boolean; showStatus?: boolean }
): string {
  let line = statusGlyph(task.status, theme);
  if (options.showStatus) line += ` ${theme.fg("dim", `${TASK_STATUS_TEXT[task.status]} ·`)}`;
  if (options.showId) line += ` ${theme.fg("accent", `#${task.id}`)}`;
  line += ` ${formatTaskSubject(task, theme)}`;

  if (task.status === "in_progress" && task.inProgressLabel) {
    const inProgressLabel = presentCompactTaskText(task.inProgressLabel);
    if (inProgressLabel) line += ` ${theme.fg("dim", `(${inProgressLabel})`)}`;
  }

  if (task.blockedBy && task.blockedBy.length > 0) {
    line += ` ${theme.fg("dim", `${TODO_DEPENDENCY_GLYPH} ${task.blockedBy.map((id) => `#${id}`).join(",")}`)}`;
  }

  return line;
}
