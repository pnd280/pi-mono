import type { Usage } from "@earendil-works/pi-ai";
import type {
  JsonAgentSessionEvent,
  SessionEntry,
  SessionStats
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { END_ENTRY, RECORD_MAX_BYTES, RESULT_MESSAGE, RUN_ENTRY } from "../constants.ts";
import { detailsSchema, detailsUsage, firstLine, sumUsage, usageSchema } from "../result.ts";

const id = z.string().min(1).max(1024);
const outcome = z.enum(["completed", "failed", "cancelled"]);
/** The child's context use; `tokens` is null when unknown, such as after compaction. */
const contextSchema = z.object({ tokens: z.number().nullable(), window: z.number() });

/** The supervisor appends one at the start of each run, after the child acknowledges `begin`. */
export const runRecordSchema = z.object({
  task_id: id,
  run_id: id,
  previous_run_id: id.nullable(),
  session_file: z.string().min(1),
  session_id: id,
  description: z.string(),
  /** The requested selection; `end` records the applied one. */
  model: z.string(),
  thinking: z.string(),
  background: z.boolean(),
  started_at: z.number()
});

/** The supervisor appends one after it observes the run's process exit. */
export const endRecordSchema = z.object({
  run_id: id,
  outcome,
  /** The first line of a failed or cancelled run's result. */
  error: z.string().optional(),
  ended_at: z.number(),
  /** This run's usage; absent when the final statistics were unavailable. */
  usage: usageSchema.optional(),
  context: contextSchema.optional(),
  /** The percentage of the latest model request's prompt read from cache. */
  cache_hit: z.number().optional(),
  model: z.string(),
  thinking: z.string(),
  background: z.boolean()
});

export type RunRecord = z.infer<typeof runRecordSchema>;

export type EndRecord = z.infer<typeof endRecordSchema>;

const fields = {
  task_id: id,
  parent_task_id: id.nullable(),
  /** The latest run on the selected ancestry. */
  run_id: id,
  description: z.string(),
  session_file: z.string().min(1),
  session_id: id,
  model: z.string(),
  thinking: z.string(),
  /** The latest run's requested selection; a resume that omits a value uses it again. */
  requested_model: z.string(),
  requested_thinking: z.string(),
  background: z.boolean(),
  /** The latest run's start and end. */
  started_at: z.number(),
  ended_at: z.number().nullable(),
  /** Total usage of the runs with recorded usage; it increases live while a run is active. */
  usage: usageSchema.optional(),
  context: contextSchema.optional(),
  cache_hit: z.number().optional(),
  error: z.string().optional()
};

/** A task as derived from run records, live state, and descendant updates. It is never persisted. */
export const taskRecordSchema = z.discriminatedUnion("state", [
  z.object({ ...fields, state: z.literal("active"), outcome: z.null() }),
  z.object({ ...fields, state: z.literal("inactive"), outcome })
]);

export type TaskRecord = z.infer<typeof taskRecordSchema>;

/** Check the original payload before stripping unknown fields from received data. */
export function withinRecordLimit(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= RECORD_MAX_BYTES;
  } catch {
    return false;
  }
}

/** The record field for the child's reported context use, if any. */
export function contextOf(stats: SessionStats | undefined): Pick<TaskRecord, "context"> {
  const usage = stats?.contextUsage;

  return usage ? { context: { tokens: usage.tokens, window: usage.contextWindow } } : {};
}

/**
 * A task's record at the start of a run; earlier usage, context, and the cache hit rate carry
 * over. A live run is active with the child's resolved selection. A restored run is cancelled
 * until its `end` replaces the outcome.
 */
export function startRun(
  run: RunRecord,
  parent: string | null,
  previous?: TaskRecord,
  launch?: { model: string; thinking: string; stats?: SessionStats }
): TaskRecord {
  const common = {
    task_id: run.task_id,
    parent_task_id: parent,
    run_id: run.run_id,
    description: run.description,
    session_file: run.session_file,
    session_id: run.session_id,
    model: launch?.model ?? run.model,
    thinking: launch?.thinking ?? run.thinking,
    requested_model: run.model,
    requested_thinking: run.thinking,
    background: run.background,
    started_at: run.started_at,
    ended_at: null,
    ...(previous?.usage ? { usage: previous.usage } : {}),
    ...(previous?.context ? { context: previous.context } : {}),
    ...contextOf(launch?.stats),
    ...(previous?.cache_hit === undefined ? {} : { cache_hit: previous.cache_hit })
  };

  return launch
    ? { ...common, state: "active", outcome: null }
    : { ...common, state: "inactive", outcome: "cancelled" };
}

/**
 * An active run's record after a child event. A completed or aborted response sets the applied
 * model and thinking level; a failed one can name a virtual model that never ran. A finished
 * message adds its usage, including late background usage, and a model request with a prompt
 * sets the cache hit rate. The run's `end` replaces this live total with exact statistics.
 */
export function applyEvent(record: TaskRecord, event: JsonAgentSessionEvent): TaskRecord {
  if (record.state !== "active") return record;
  if (event.type === "thinking_level_changed")
    return event.level === record.thinking ? record : { ...record, thinking: event.level };
  if (event.type !== "message_end") return record;
  const message = event.message;
  let next = record;

  if (message.role === "assistant" && message.stopReason !== "error") {
    const model = `${message.provider}/${message.model}`;
    const thinking = message.thinkingLevel ?? record.thinking;
    if (model !== record.model || thinking !== record.thinking) next = { ...next, model, thinking };
  }

  let usage: Usage | undefined;
  if (message.role === "assistant" || message.role === "toolResult") usage = message.usage;
  else if (message.role === "custom" && message.customType === RESULT_MESSAGE)
    usage = detailsSchema.safeParse(message.details).data?.late_usage?.usage;
  if (!usage) return next;
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;

  return {
    ...next,
    usage: sumUsage(next.usage ?? detailsUsage(), detailsUsage(usage)),
    ...(message.role === "assistant" && prompt > 0
      ? { cache_hit: (usage.cacheRead / prompt) * 100 }
      : {})
  };
}

export function promoteRun(record: TaskRecord): TaskRecord {
  return { ...record, background: true };
}

/** A run that stopped without an `end` on this ancestry, such as a descendant of an exited run. */
export function stopRun(record: TaskRecord): TaskRecord {
  return { ...record, state: "inactive", outcome: "cancelled" };
}

/**
 * The `end` record of an active run. `usage` is the run's statistics difference, absent when
 * unknown. A failed or cancelled run records the first line of its result as the error.
 */
export function endRecord(
  record: TaskRecord,
  result: { outcome: EndRecord["outcome"]; text: string; usageEnd?: SessionStats },
  usage: TaskRecord["usage"],
  endedAt: number
): EndRecord {
  const error = result.outcome === "completed" ? undefined : firstLine(result.text) || undefined;
  const context = contextOf(result.usageEnd).context ?? record.context;

  return {
    run_id: record.run_id,
    outcome: result.outcome,
    ...(error ? { error } : {}),
    ended_at: endedAt,
    ...(usage ? { usage } : {}),
    ...(context ? { context } : {}),
    ...(record.cache_hit === undefined ? {} : { cache_hit: record.cache_hit }),
    model: record.model,
    thinking: record.thinking,
    background: record.background
  };
}

/**
 * A task's record after its run's `end`. `task` is the record from the run's start, so the run's
 * usage adds to the usage of earlier runs only; without it, the total keeps those runs.
 */
export function endRun(task: TaskRecord, end: EndRecord): TaskRecord {
  const { error: _error, ...rest } = task;

  return {
    ...rest,
    model: end.model,
    thinking: end.thinking,
    background: end.background,
    ended_at: end.ended_at,
    ...(end.usage ? { usage: task.usage ? sumUsage(task.usage, end.usage) : end.usage } : {}),
    ...(end.context ? { context: end.context } : {}),
    ...(end.cache_hit === undefined ? {} : { cache_hit: end.cache_hit }),
    ...(end.error ? { error: end.error } : {}),
    state: "inactive",
    outcome: end.outcome
  };
}

/**
 * The tasks whose runs are on one supervisor ancestry. The latest run sets each task's state;
 * a run without an `end` on the ancestry was cancelled, and its usage is unknown.
 */
export function taskHistory(
  entries: readonly SessionEntry[],
  parent: string | null
): Map<string, TaskRecord> {
  const tasks = new Map<string, TaskRecord>();

  for (const entry of entries) {
    if (entry.type !== "custom" || !withinRecordLimit(entry.data)) continue;

    if (entry.customType === RUN_ENTRY) {
      const run = runRecordSchema.safeParse(entry.data).data;
      if (!run) continue;
      const previous = tasks.get(run.task_id);
      // A task keeps one child file for its whole life.
      if (
        previous &&
        (previous.session_file !== run.session_file || previous.session_id !== run.session_id)
      )
        continue;
      tasks.set(run.task_id, startRun(run, parent, previous));
    } else if (entry.customType === END_ENTRY) {
      const end = endRecordSchema.safeParse(entry.data).data;
      const task = end && [...tasks.values()].find((item) => item.run_id === end.run_id);
      if (end && task?.ended_at === null) tasks.set(task.task_id, endRun(task, end));
    }
  }

  return tasks;
}
