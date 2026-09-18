import type { Theme } from "@earendil-works/pi-coding-agent";

import type { TaskStatus } from "./types.ts";

export const TASK_STATUS_GLYPH = {
  pending: "⊖",
  in_progress: "●",
  completed: "✓",
  deleted: "×"
} satisfies Record<TaskStatus, string>;

export const TASK_STATUS_COLOR = {
  pending: "accent",
  in_progress: "accent",
  completed: "success",
  deleted: "muted"
} satisfies Record<TaskStatus, Parameters<Theme["fg"]>[0]>;

export const TASK_STATUS_TEXT = {
  pending: "pending",
  in_progress: "in progress",
  completed: "completed",
  deleted: "deleted"
} satisfies Record<TaskStatus, string>;

export const TODO_TREE_GLYPH = { guide: "│", branch: "├─", lastBranch: "└─" };

export const TODO_DEPENDENCY_GLYPH = "⊣";

export const TODO_FEEDBACK_GLYPH = { empty: "○", success: "✓", error: "✗" };

export function statusGlyph(status: TaskStatus, theme: Pick<Theme, "fg">): string {
  return theme.fg(TASK_STATUS_COLOR[status], TASK_STATUS_GLYPH[status]);
}
