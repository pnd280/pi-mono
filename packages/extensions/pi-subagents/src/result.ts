import type { Usage } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type SessionStats
} from "@earendil-works/pi-coding-agent";
import { textPrefix } from "@pi-mono/libs/tui/text-budget";
import { formatTaskEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

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
  usage: usageSchema,
  /** Background usage after the call returned, counted once when the result is persisted. */
  late_usage: z
    .object({
      provider: z.string(),
      model: z.string(),
      usage: z.object({
        input: z.number(),
        output: z.number(),
        cacheRead: z.number(),
        cacheWrite: z.number(),
        totalTokens: z.number(),
        cost: z.object({
          input: z.number(),
          output: z.number(),
          cacheRead: z.number(),
          cacheWrite: z.number(),
          total: z.number()
        })
      })
    })
    .optional()
});

export type ToolDetails = z.infer<typeof detailsSchema>;

export type LateUsage = NonNullable<ToolDetails["late_usage"]>;

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

/** Splits `provider/model` at the first `/`; model IDs can contain `/`. */
export function splitModel(model: string): { provider: string; model: string } {
  const index = model.indexOf("/");

  return index < 0
    ? { provider: "", model }
    : { provider: model.slice(0, index), model: model.slice(index + 1) };
}

/** Usage after a background call returned, or `undefined` when there is none to count. */
export function lateUsage(
  reported: SessionStats | undefined,
  end: SessionStats | undefined,
  model: string
): LateUsage | undefined {
  if (!reported || !end) return undefined;
  const usage = usageDifference(reported, end);
  if (!usage.totalTokens && !usage.cost.total) return undefined;

  return { ...splitModel(model), usage };
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

/** The first non-empty line of a result, as a failed or cancelled run's error. */
export function firstLine(text: string): string {
  const line =
    text
      .split("\n")
      .find((part) => part.trim())
      ?.trim() ?? "";
  const kept = textPrefix(line, ERROR_LINE_MAX);

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
