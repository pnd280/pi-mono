import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { checkpointReference } from "./checkpoints.ts";
import {
  RECORD_MAX_BYTES,
  TASK_ENTRY,
  TRANSFER_ENTRY,
  TRANSFER_PENDING_ENTRY
} from "./constants.ts";
import { usageSchema } from "./result.ts";

const fields = {
  task_id: z.string().min(1),
  parent_task_id: z.string().nullable(),
  description: z.string(),
  session_file: z.string().min(1),
  session_id: z.string().min(1),
  checkpoint: checkpointReference,
  owner_session_id: z.string().min(1),
  owner_session_file: z.string().optional(),
  model: z.string(),
  thinking: z.string(),
  background: z.boolean(),
  /** The latest run's start and end. Records saved before these fields existed omit them. */
  started_at: z.number().optional(),
  ended_at: z.number().nullable().optional(),
  /** Total usage across all runs; it increases live while a run is active. */
  usage: usageSchema.optional(),
  /** The child's latest context use; `tokens` is null when unknown, such as after compaction. */
  context: z.object({ tokens: z.number().nullable(), window: z.number() }).optional(),
  /** The percentage of the latest model request's prompt read from cache. */
  cache_hit: z.number().optional(),
  slot_request_id: z.string().min(1).optional()
};

export const taskRecordSchema = z.discriminatedUnion("state", [
  z.object({ ...fields, state: z.literal("active"), outcome: z.null() }),
  z.object({
    ...fields,
    state: z.literal("inactive"),
    outcome: z.enum(["completed", "failed", "cancelled"])
  })
]);

export type TaskRecord = z.infer<typeof taskRecordSchema>;

export const transferRecordSchema = z.intersection(
  taskRecordSchema,
  z.object({ recipient_session_id: z.string().min(1) })
);

export type TransferRecord = z.infer<typeof transferRecordSchema>;

export const pendingTransferSchema = z.object({
  record: transferRecordSchema,
  from_task_id: z.string().min(1)
});

/** Check the original payload before stripping unknown fields from persisted data. */
function withinRecordLimit(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= RECORD_MAX_BYTES;
  } catch {
    return false;
  }
}

export function parseRecord(value: unknown): TaskRecord | undefined {
  return withinRecordLimit(value) ? taskRecordSchema.safeParse(value).data : undefined;
}

export function parsePendingTransfer(value: unknown) {
  return withinRecordLimit(value) ? pendingTransferSchema.safeParse(value).data : undefined;
}

export function rebuildOwnership(entries: readonly SessionEntry[]) {
  const tasks = new Map<string, TaskRecord>();
  const transfers = new Map<string, TransferRecord>();
  const pending = new Map<string, z.infer<typeof pendingTransferSchema>>();

  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === TRANSFER_PENDING_ENTRY) {
      const intent = parsePendingTransfer(entry.data);
      if (intent) pending.set(intent.record.task_id, intent);
      continue;
    }

    if (
      entry.type !== "custom" ||
      (entry.customType !== TASK_ENTRY && entry.customType !== TRANSFER_ENTRY)
    )
      continue;
    const record = parseRecord(entry.data);
    if (!record) continue;
    pending.delete(record.task_id);

    if (entry.customType === TRANSFER_ENTRY) {
      const transfer = transferRecordSchema.safeParse(entry.data).data;
      if (!transfer) continue;
      tasks.delete(record.task_id);
      transfers.set(record.task_id, transfer);
      continue;
    }

    transfers.delete(record.task_id);
    tasks.set(
      record.task_id,
      record.state === "active" ? { ...record, state: "inactive", outcome: "cancelled" } : record
    );
  }

  return { tasks, transfers, pending };
}

export function appendRecord(
  append: (type: string, data: TaskRecord) => void,
  record: TaskRecord
): TaskRecord {
  const parsed = parseRecord(record);
  if (!parsed) throw new Error("Subagent task record is invalid or too large");
  append(TASK_ENTRY, parsed);

  return parsed;
}
