import type { ExtensionAPI, SessionStats } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { JOB_RESULT_MESSAGE, RESULT_MESSAGE } from "./constants.ts";
import type { JobDetails } from "./jobs/records.ts";
import { detailsSchema, jobText, taskResult, usageDifference, type ToolDetails } from "./result.ts";

/**
 * A background result message, ready for `pi.sendMessage`. This module alone builds and reads its
 * `customType`, content text, and details, including `late_usage`; pi-tool-display and
 * `@pi-mono/utils/task-envelope` read the same format.
 */
export type ResultMessage = Parameters<ExtensionAPI["sendMessage"]>[0];

/** What a result source reports when a background task or job finishes. */
export type ResultEvent =
  /**
   * A result to deliver. Only job results survive a pending session change, because jobs stop
   * only when the change is final; see ADR 0005.
   */
  | { kind: "result"; message: ResultMessage; survivesChange: boolean }
  /** No result, but the work that holds the run changed, such as after a `subagent_abort` drop. */
  | { kind: "changed" };

/**
 * The finished background results of one registry: the seam that delivery reads. Delivery keeps
 * the timing; the registry decides which results exist and whether its unfinished work holds the
 * supervisor's run.
 */
export class ResultSource {
  private listeners = new Set<(event: ResultEvent) => void>();

  constructor(private readonly holding: () => boolean) {}

  /** An unfinished result of this source holds the supervisor's run; see ADR 0001 and ADR 0005. */
  holdsRun(): boolean {
    return this.holding();
  }

  subscribe(listener: (event: ResultEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Reports a finished task or job. A failing listener cannot change process lifetime. */
  publish(event: ResultEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* Observers cannot change process lifetime. */
      }
    }
  }
}

const lateUsageSchema = z.object({
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
});

/** The details of a task's background result message. */
export const resultDetailsSchema = detailsSchema.extend({
  /** Background usage after the call returned, counted once when the result is persisted. */
  late_usage: lateUsageSchema.optional()
});

export type LateUsage = z.infer<typeof lateUsageSchema>;

/** Splits `provider/model` at the first `/`; model IDs can contain `/`. */
function splitModel(model: string): { provider: string; model: string } {
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

/** The result message of a background or promoted task's run, from the run's completion. */
export function taskResultMessage({
  details,
  text,
  outcome,
  lateUsage: late
}: {
  details: ToolDetails;
  text: string;
  outcome: string;
  lateUsage?: LateUsage;
}): ResultMessage {
  const result = taskResult(
    details,
    text,
    undefined,
    `Background task ${outcome}: ${details.description}`
  );

  return {
    customType: RESULT_MESSAGE,
    display: true,
    content: result.content,
    // `late_usage` becomes a hidden usage entry when Pi persists this message; see ADR 0002.
    details: { ...result.details, ...(late ? { late_usage: late } : {}) }
  };
}

/**
 * The result message of a job whose command exited. `output` is Pi's output tail with its status
 * line; when it does not already state the job's error (`stated`), an `Error:` line names it.
 */
export function jobResultMessage(
  details: JobDetails & { state: "inactive" },
  output: string,
  stated: boolean
): ResultMessage {
  // Pi gives details only to the UI; the model learns the reason from this text.
  const body = [
    // Pi keeps the output's final newline; the join adds the blank line.
    output.trimEnd(),
    !stated && details.error && `Error: ${details.error}`,
    `Log file: ${details.log_file}`
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    customType: JOB_RESULT_MESSAGE,
    display: true,
    content: [
      {
        type: "text",
        text: jobText(details, body, `Background job ${details.outcome}: ${details.description}`)
      }
    ],
    details
  };
}

/**
 * The late usage that a task's result message carries, for the ADR 0002 patch when Pi persists
 * the message, and for a run's live usage when its child reports the message.
 */
export function lateUsageOf(message: {
  customType: string;
  details?: unknown;
}): LateUsage | undefined {
  if (message.customType !== RESULT_MESSAGE) return undefined;

  return resultDetailsSchema.safeParse(message.details).data?.late_usage;
}
