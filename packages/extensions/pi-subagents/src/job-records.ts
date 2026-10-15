import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { formatJobEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import { JOB_END_ENTRY, JOB_ENTRY } from "./constants.ts";
import { withinRecordLimit } from "./records.ts";

const id = z.string().min(1).max(1024);
const outcome = z.enum(["completed", "failed", "cancelled"]);

export const jobInputSchema = z.strictObject({
  command: z.string().min(1).describe("The shell command to run in the background."),
  description: z.string().min(1).describe("A short (3 to 5 words) label for the job."),
  // Pi's shell timer limit. A refinement keeps the projected schema like `bash`'s.
  timeout: z
    .number()
    .refine(
      (value) => value > 0 && value <= 2_147_483,
      "timeout must be more than 0 and at most 2147483 seconds"
    )
    .optional()
    .describe("Timeout in seconds, more than 0 and at most 2147483 (optional, no default timeout).")
});

export type JobInput = z.infer<typeof jobInputSchema>;

export const jobParameters = toToolSchema(jobInputSchema);

export const jobAbortInputSchema = z.strictObject({
  job_id: z.string().min(1).describe("The ID of an active job that you started.")
});

export type JobAbortInput = z.infer<typeof jobAbortInputSchema>;

export const jobAbortParameters = toToolSchema(jobAbortInputSchema);

/** The supervisor appends one when a job starts. */
export const jobEntrySchema = z.object({
  job_id: id,
  description: z.string(),
  command: z.string(),
  log_file: z.string().min(1),
  started_at: z.number()
});

/** The supervisor appends one after a job's command exits. */
export const jobEndEntrySchema = z.object({
  job_id: id,
  outcome,
  /** Null after a timeout, a cancellation, or a start failure. */
  exit_code: z.number().nullable(),
  /** The first line of a failed or cancelled job's reason. */
  error: z.string().optional(),
  ended_at: z.number()
});

export type JobEntry = z.infer<typeof jobEntrySchema>;

export type JobEndEntry = z.infer<typeof jobEndEntrySchema>;

const fields = {
  job_id: id,
  description: z.string(),
  command: z.string(),
  log_file: z.string().min(1),
  started_at: z.number()
};

const inactive = {
  ...fields,
  state: z.literal("inactive"),
  outcome,
  exit_code: z.number().nullable(),
  /** Null when the job stopped without an end entry, such as at a session change. */
  ended_at: z.number().nullable(),
  error: z.string().optional()
};

const active = { ...fields, state: z.literal("active"), exit_code: z.null(), ended_at: z.null() };

/** A job as derived from its entries and live state. It is never persisted. */
export const jobRecordSchema = z.discriminatedUnion("state", [
  z.object(active),
  z.object(inactive)
]);

export type JobRecord = z.infer<typeof jobRecordSchema>;

/** A job's tool and result-message details; `binding_id` is the supervisor's session ID. */
export const jobDetailsSchema = z.discriminatedUnion("state", [
  z.object({ ...active, binding_id: id }),
  z.object({ ...inactive, binding_id: id })
]);

export type JobDetails = z.infer<typeof jobDetailsSchema>;

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

/** A started job's record before its end entry; without one, the job was cancelled. */
export function stoppedJob(entry: JobEntry): JobRecord {
  return { ...entry, state: "inactive", outcome: "cancelled", exit_code: null, ended_at: null };
}

/** The jobs whose entries are on one supervisor ancestry, in start order. */
export function jobHistory(entries: readonly SessionEntry[]): Map<string, JobRecord> {
  const jobs = new Map<string, JobRecord>();

  for (const entry of entries) {
    if (entry.type !== "custom" || !withinRecordLimit(entry.data)) continue;

    if (entry.customType === JOB_ENTRY) {
      const job = jobEntrySchema.safeParse(entry.data).data;
      if (job && !jobs.has(job.job_id)) jobs.set(job.job_id, stoppedJob(job));
    } else if (entry.customType === JOB_END_ENTRY) {
      const end = jobEndEntrySchema.safeParse(entry.data).data;
      const job = end && jobs.get(end.job_id);

      if (end && job?.state === "inactive" && job.ended_at === null) {
        const { error: _error, ...rest } = job;
        jobs.set(end.job_id, {
          ...rest,
          outcome: end.outcome,
          exit_code: end.exit_code,
          ended_at: end.ended_at,
          ...(end.error ? { error: end.error } : {})
        });
      }
    }
  }

  return jobs;
}
