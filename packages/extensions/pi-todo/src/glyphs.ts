import type { Theme } from "@earendil-works/pi-coding-agent";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import type { TaskStatus } from "./types.ts";

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

export const TODO_TREE_GLYPH = {
  guide: TUI_GLYPHS.tree.guide,
  branch: `${TUI_GLYPHS.tree.branch}${TUI_GLYPHS.tree.horizontal}`,
  lastBranch: `${TUI_GLYPHS.tree.lastBranch}${TUI_GLYPHS.tree.horizontal}`
};

export const TODO_DEPENDENCY_GLYPH = "⊣";

export function statusGlyph(status: TaskStatus, theme: Pick<Theme, "fg">): string {
  return theme.fg(TASK_STATUS_COLOR[status], TUI_GLYPHS.taskStatus[status]);
}
