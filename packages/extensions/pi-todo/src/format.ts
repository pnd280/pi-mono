import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import { MSG_NO_TODOS } from "./constants.ts";
import { TASK_STATUS_TEXT } from "./glyphs.ts";
import { deriveTaskHierarchy, type TaskHierarchyEntry } from "./hierarchy.ts";
import { presentCompactTaskText } from "./text.ts";
import type { Task } from "./types.ts";

export type TodosSummary = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
};

export function summarizeVisibleTodos(tasks: readonly Task[]): TodosSummary {
  const visible = tasks.filter((task) => task.status !== "deleted");

  return {
    total: visible.length,
    pending: visible.filter((task) => task.status === "pending").length,
    inProgress: visible.filter((task) => task.status === "in_progress").length,
    completed: visible.filter((task) => task.status === "completed").length
  };
}

export function formatTodosSummary(tasks: readonly Task[]): string {
  const summary = summarizeVisibleTodos(tasks);
  if (summary.total === 0) return MSG_NO_TODOS;

  const header: string[] = [];
  if (summary.completed > 0) header.push(`${summary.completed}/${summary.total} completed`);

  if (summary.inProgress > 0) {
    header.push(`${summary.inProgress} ${TASK_STATUS_TEXT.in_progress}`);
  }

  if (summary.pending > 0) header.push(`${summary.pending} pending`);

  return header.join(" · ");
}

export function formatTodosCommandOutput(tasks: readonly Task[]): string {
  const hierarchy = deriveTaskHierarchy(tasks);
  const entries = hierarchy?.entries.filter((entry) => entry.task.status !== "deleted") ?? [];
  if (entries.length === 0) return formatEmptyTodosMessage();

  return [formatTodosSummary(tasks), ...entries.map(renderCommandTask)].join("\n");
}

export function formatEmptyTodosMessage(): string {
  return `○ ${MSG_NO_TODOS}`;
}

function renderCommandTask(entry: TaskHierarchyEntry): string {
  const { task } = entry;
  const subject = presentCompactTaskText(task.subject);
  const inProgressLabel =
    task.status === "in_progress" && task.inProgressLabel
      ? ` (${presentCompactTaskText(task.inProgressLabel)})`
      : "";
  const blockedBy =
    task.blockedBy !== undefined && task.blockedBy.length > 0
      ? `    Blocked by: ${task.blockedBy.map((id) => `#${id}`).join(",")}`
      : "";
  const indentation = "  ".repeat(entry.depth);

  return `${indentation}${TUI_GLYPHS.taskStatus[task.status]} ${TASK_STATUS_TEXT[task.status]} · #${task.id} ${subject}${inProgressLabel}${blockedBy}`;
}
