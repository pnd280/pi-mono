import { displayText, styledOutput } from "@pi-mono/libs/tui/terminal-text";

import type { TaskMutationParams } from "./types.ts";

/** Normalize task whitespace before the shared terminal sanitizer expands tabs/CR. */
export function sanitizeCompactTaskText(text: string): string {
  return displayText(styledOutput(text.replace(/[\r\n\t]+/g, " "))).replace(/ +/g, " ");
}

export function sanitizeTaskDescription(text: string): string {
  return displayText(styledOutput(text.replaceAll("\r", "").replaceAll("\t", "  ")));
}

function excerpt(text: string, maximum: number): string {
  const points = Array.from(text);

  return points.length <= maximum ? text : points.slice(0, maximum - 1).join("") + "…";
}

export function presentCompactTaskText(text: string): string {
  return excerpt(sanitizeCompactTaskText(text).trim(), 200);
}

export function presentTaskDescription(text: string): string {
  return excerpt(sanitizeTaskDescription(text), 4000);
}

export function sanitizeTaskMutationParams(params: TaskMutationParams): TaskMutationParams {
  const sanitized = { ...params };
  if (params.subject !== undefined) sanitized.subject = sanitizeCompactTaskText(params.subject);
  if (params.description !== undefined)
    sanitized.description = sanitizeTaskDescription(params.description);
  if (params.inProgressLabel !== undefined)
    sanitized.inProgressLabel = sanitizeCompactTaskText(params.inProgressLabel);
  if (params.owner !== undefined) sanitized.owner = sanitizeCompactTaskText(params.owner);

  return sanitized;
}
