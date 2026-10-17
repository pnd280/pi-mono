import type { Usage } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type SessionStats
} from "@earendil-works/pi-coding-agent";
import { sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";
import { formatJobEnvelope, formatTaskEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import type { JobRecord } from "./jobs/records.ts";

export const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_write: z.number(),
  cost: z.number()
});

export const detailsSchema = z.object({
  task_id: z.string().optional(),
  binding_id: z.string().optional(),
  description: z.string(),
  model: z.string(),
  thinking: z.string(),
  background: z.boolean(),
  delivery: z.enum(["follow_up", "steer"]),
  state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  started_at: z.number(),
  ended_at: z.number().nullable(),
  activity: z.string(),
  /** Set when a call returns while its task keeps running: a background start or sent input. */
  returned: z.enum(["background", "input"]).optional(),
  /** The first line of a failed or cancelled call's result body. */
  error: z.string().optional(),
  usage: usageSchema
});

export type ToolDetails = z.infer<typeof detailsSchema>;

export function boundedText(text: string, maxLines = DEFAULT_MAX_LINES): string {
  const result = truncateHead(text, { maxLines, maxBytes: DEFAULT_MAX_BYTES });

  return result.truncated ? `${result.content}\n[Text truncated]` : result.content;
}

export function usageDifference(start: SessionStats, end: SessionStats): Usage {
  return {
    input: end.tokens.input - start.tokens.input,
    output: end.tokens.output - start.tokens.output,
    cacheRead: end.tokens.cacheRead - start.tokens.cacheRead,
    cacheWrite: end.tokens.cacheWrite - start.tokens.cacheWrite,
    totalTokens: end.tokens.total - start.tokens.total,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: end.cost - start.cost }
  };
}

export function detailsUsage(usage?: Usage): ToolDetails["usage"] {
  return {
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    cache_read: usage?.cacheRead ?? 0,
    cache_write: usage?.cacheWrite ?? 0,
    cost: usage?.cost.total ?? 0
  };
}

export function sumUsage(a: ToolDetails["usage"], b: ToolDetails["usage"]): ToolDetails["usage"] {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_write: a.cache_write + b.cache_write,
    cost: a.cost + b.cost
  };
}

const ERROR_LINE_MAX = 512;

/** The first non-empty line of a result, as a failed or cancelled run's error, at most `max` long. */
export function firstLine(text: string, max = ERROR_LINE_MAX): string {
  const line =
    text
      .split("\n")
      .find((part) => part.trim())
      ?.trim() ?? "";
  const kept = sliceTerminalText(line, 0, max).text;

  return kept.length < line.length ? `${kept}…` : line;
}

/** A call or message result. `notice` precedes the body; the error comes from the body alone. */
export function taskResult(
  input: ToolDetails,
  body: string,
  usage?: Usage,
  summary?: string,
  notice?: string
) {
  const error = input.state === "failed" || input.state === "cancelled";
  const reason = error ? firstLine(body) : "";
  const details = reason ? { ...input, error: reason } : input;

  return {
    content: [
      {
        type: "text" as const,
        text: formatTaskEnvelope({
          id: details.task_id,
          state: details.state,
          summary: summary && boundedText(summary),
          body: boundedText(notice ? `${notice}\n\n${body}` : body)
        })
      }
    ],
    details,
    ...(error ? { isError: true } : {}),
    ...(usage ? { usage } : {})
  };
}

/** The model-facing `<job>` text of a call result or a result message. */
export function jobText(record: JobRecord, body: string, summary?: string): string {
  return formatJobEnvelope({
    id: record.job_id,
    state: record.state,
    ...(record.state === "inactive"
      ? { outcome: record.outcome, exit_code: record.exit_code }
      : {}),
    summary,
    body
  });
}
