// The `pi-subagents/details` contract, shared with the display adapter. It imports only Zod.
import { z } from "zod";

export const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_write: z.number(),
  cost: z.number()
});

/** How input reaches an active task; the tool, details, and control protocol share it. */
export const deliverySchema = z.enum(["follow_up", "steer"]);

/** The details of `subagent` and `subagent_abort` results and of task result messages. */
export const detailsSchema = z.object({
  task_id: z.string().optional(),
  binding_id: z.string().optional(),
  description: z.string(),
  model: z.string(),
  thinking: z.string(),
  background: z.boolean(),
  delivery: deliverySchema,
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

const jobId = z.string().min(1).max(1024);

export const jobOutcomeSchema = z.enum(["completed", "failed", "cancelled"]);

/** The supervisor appends one when a job starts. */
export const jobEntrySchema = z.object({
  job_id: jobId,
  description: z.string(),
  command: z.string(),
  log_file: z.string().min(1),
  started_at: z.number()
});

const inactiveJobSchema = jobEntrySchema.extend({
  state: z.literal("inactive"),
  outcome: jobOutcomeSchema,
  exit_code: z.number().nullable(),
  /** Null when the job stopped without an end entry, such as at a session change. */
  ended_at: z.number().nullable(),
  error: z.string().optional()
});

const activeJobSchema = jobEntrySchema.extend({
  state: z.literal("active"),
  exit_code: z.null(),
  ended_at: z.null()
});

/** A job as derived from its entries and live state. It is never persisted. */
const jobRecordSchema = z.discriminatedUnion("state", [activeJobSchema, inactiveJobSchema]);

export type JobRecord = z.infer<typeof jobRecordSchema>;

/** The details of `job_abort` results and job result messages. */
export const inactiveJobDetailsSchema = inactiveJobSchema.extend({ binding_id: jobId });

/** A job's tool and result-message details; `binding_id` is the supervisor's session ID. */
export const jobDetailsSchema = z.discriminatedUnion("state", [
  activeJobSchema.extend({ binding_id: jobId }),
  inactiveJobDetailsSchema
]);

export type JobDetails = z.infer<typeof jobDetailsSchema>;
