import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import { deriveTaskHierarchy, type TaskHierarchyEntry } from "../state/hierarchy.ts";
import type { Task } from "../state/model.ts";
import { formatTodosSummary, presentCompactTaskText, TASK_STATUS_TEXT } from "../text.ts";

const MSG_NO_TODOS = "No todos yet. Ask the agent to add some!";

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
