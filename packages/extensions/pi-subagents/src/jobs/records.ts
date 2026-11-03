import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

import { JOB_END_ENTRY, JOB_ENTRY } from "../constants.ts";
import { jobEntrySchema, jobOutcomeSchema, type JobRecord } from "../details.ts";
import { withinRecordLimit } from "../tasks/records.ts";

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
    .describe(
      "Timeout in seconds, more than 0 and at most 2147483 (optional, no default timeout)."
    ),
  hold_run: z
    .boolean()
    .optional()
    .describe(
      "Set true when you need the result before you finish: your run then waits for the job to exit, and its result arrives automatically. Only for a command that exits by itself, never for a server or a watcher (optional, default false)."
    )
});

export type JobInput = z.infer<typeof jobInputSchema>;

export const jobParameters = toToolSchema(jobInputSchema);

export const jobAbortInputSchema = z.strictObject({
  job_id: z.string().min(1).describe("The ID of an active job that you started.")
});

export type JobAbortInput = z.infer<typeof jobAbortInputSchema>;

export const jobAbortParameters = toToolSchema(jobAbortInputSchema);

/** The supervisor appends one after a job's command exits. */
const jobEndEntrySchema = z.object({
  job_id: jobEntrySchema.shape.job_id,
  outcome: jobOutcomeSchema,
  /** Null after a timeout, a cancellation, or a start failure. */
  exit_code: z.number().nullable(),
  /** The first line of a failed or cancelled job's reason. */
  error: z.string().optional(),
  ended_at: z.number()
});

export type JobEntry = z.infer<typeof jobEntrySchema>;

export type JobEndEntry = z.infer<typeof jobEndEntrySchema>;

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
        jobs.set(end.job_id, {
          ...job,
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
