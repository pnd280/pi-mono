import {
  compactDisplayText,
  displayText,
  sliceTerminalText,
  styledOutput
} from "@pi-mono/libs/tui/terminal-text";

import type { Task, TaskMutationParams, TaskStatus } from "./state/model.ts";

// pi-tool-display imports this module (`pi-todo/text`) for todo cards; keep it free of runtime host imports.

export const TASK_STATUS_TEXT = {
  pending: "pending",
  in_progress: "in progress",
  completed: "completed",
  deleted: "deleted"
} satisfies Record<TaskStatus, string>;

export function sanitizeTaskDescription(text: string): string {
  return displayText(styledOutput(text.replaceAll("\r", "").replaceAll("\t", "  ")));
}

function excerpt(text: string, maximum: number): string {
  const points = Array.from(text);

  if (points.length <= maximum) return text;
  const end = points.slice(0, maximum - 1).join("").length;

  return sliceTerminalText(text, 0, end).text + "…";
}

export function presentCompactTaskText(text: string): string {
  return excerpt(compactDisplayText(text).trim(), 200);
}

/** Progress over todos that are not deleted, such as `1/3 completed · 1 in progress · 1 pending`. */
export function formatTodosSummary(tasks: readonly Pick<Task, "status">[]): string {
  const visible = tasks.filter((task) => task.status !== "deleted");
  if (!visible.length)
    return tasks.length ? `${tasks.length} deleted · no active todos` : "No todos";
  const completed = visible.filter((task) => task.status === "completed").length;
  const inProgress = visible.filter((task) => task.status === "in_progress").length;
  const pending = visible.filter((task) => task.status === "pending").length;
  const header: string[] = [];
  if (completed > 0) header.push(`${completed}/${visible.length} completed`);
  if (inProgress > 0) header.push(`${inProgress} ${TASK_STATUS_TEXT.in_progress}`);
  if (pending > 0) header.push(`${pending} ${TASK_STATUS_TEXT.pending}`);

  return header.join(" · ");
}

export function presentTaskDescription(text: string): string {
  return excerpt(sanitizeTaskDescription(text), 4000);
}

export function sanitizeTaskMutationParams(params: TaskMutationParams): TaskMutationParams {
  const sanitized = { ...params };
  if (params.subject !== undefined) sanitized.subject = compactDisplayText(params.subject);
  if (params.description !== undefined)
    sanitized.description = sanitizeTaskDescription(params.description);
  if (params.inProgressLabel !== undefined)
    sanitized.inProgressLabel = compactDisplayText(params.inProgressLabel);
  if (params.owner !== undefined) sanitized.owner = compactDisplayText(params.owner);

  return sanitized;
}
