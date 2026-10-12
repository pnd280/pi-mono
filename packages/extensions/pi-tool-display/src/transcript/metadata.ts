import { z } from "zod";

import type { ChangeUnavailableReason } from "../contracts.ts";
import { isChangeUnavailableReason, PATCH_BYTES } from "../diff.ts";

/** Session facts of one call that Pi's own entries do not hold. */
export const CALL_TYPE = "pi-tool-display.call";

/** Names the local file that holds the details of the calls after it on the branch. */
export const WRITER_TYPE = "pi-tool-display.writer";

export const MAX_RECORD_BYTES = 160 * 1024;

/** Pi entry and tool-call IDs, in session entries and local lines. */
export const idSchema = z.string().min(1).max(1024);

const patchSchema = z.string().refine((patch) => Buffer.byteLength(patch) <= PATCH_BYTES);

const callRecordSchema = z.object({
  /** Pi entry ID of the assistant message that holds the call. */
  entry: idSchema,
  toolCallId: idSchema,
  /** The call was cancelled, for any tool; Pi's result has no cancellation flag. */
  cancelled: z.literal(true).optional(),
  /** The observed operation failed, independently of Pi's result and call cancellation. */
  outcome: z.literal("failure").optional(),
  /** Shell only, when success does not imply exit 0; null when the process had no exit code. */
  exitCode: z.int().nullable().optional(),
  timedOut: z.literal(true).optional(),
  /** edit and write: the change was applied although Pi reported failure. */
  applied: z.literal(true).optional(),
  change: z
    .discriminatedUnion("kind", [
      // Replay derives the patch from the content argument when this omits it.
      z.object({ kind: z.literal("creation"), patch: patchSchema.optional() }),
      z.object({ kind: z.literal("modification"), patch: patchSchema }),
      z.object({
        kind: z.literal("unavailable"),
        reason: z.custom<ChangeUnavailableReason>(isChangeUnavailableReason)
      })
    ])
    .optional()
});

export type CallRecord = z.infer<typeof callRecordSchema>;

const writerRecordSchema = z.object({ writer: z.uuid(), cwd: z.string().min(1).max(4096) });

export type WriterRecord = z.infer<typeof writerRecordSchema>;

function bounded(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= MAX_RECORD_BYTES;
  } catch {
    return false;
  }
}

/** The whole original value counts toward the limit, including unknown fields. */
export function parseCallRecord(value: unknown): CallRecord | undefined {
  const parsed = callRecordSchema.safeParse(value);

  return parsed.success && bounded(value) ? parsed.data : undefined;
}

export function parseWriterRecord(value: unknown): WriterRecord | undefined {
  const parsed = writerRecordSchema.safeParse(value);

  return parsed.success && bounded(value) ? parsed.data : undefined;
}
