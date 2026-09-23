import { compactDisplayText, displayText, styledOutput } from "@pi-mono/libs/tui/terminal-text";

import type { TaskMutationParams } from "./types.ts";

export function sanitizeTaskDescription(text: string): string {
  return displayText(styledOutput(text.replaceAll("\r", "").replaceAll("\t", "  ")));
}

function excerpt(text: string, maximum: number): string {
  const points = Array.from(text);

  return points.length <= maximum ? text : points.slice(0, maximum - 1).join("") + "…";
}

export function presentCompactTaskText(text: string): string {
  return excerpt(compactDisplayText(text).trim(), 200);
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
