import { z } from "zod";

import type { ChangeUnavailableReason } from "../contracts.ts";
import { isChangeUnavailableReason, PATCH_BYTES } from "../diff.ts";

/** Session facts of one call that Pi's own entries do not hold. */
export const CALL_TYPE = "pi-tool-display.call";

export const MAX_RECORD_BYTES = 160 * 1024;

/** Pi entry and tool-call IDs. */
const idSchema = z.string().min(1).max(1024);

const patchSchema = z.string().refine((patch) => Buffer.byteLength(patch) <= PATCH_BYTES);

const lineCountSchema = z.int().min(0);

/** The part of a nested call's ID after its caller's ID and `/`, such as `1` or `2/1`. */
const nestedKeySchema = z
  .string()
  .max(1024)
  .regex(/^[1-9]\d*(?:\/[1-9]\d*)*$/);

/** What replay of a nested `edit` or `write` call needs beyond Pi's `nestedCalls` record. */
const nestedChangeSchema = z.object({
  /** Observed, because Pi's record has no arguments for the call. */
  path: z.string().min(1).max(4096).optional(),
  created: z.literal(true).optional(),
  /** Added and removed lines of a successful change, unless replay derives them from Pi's content argument. */
  lines: z.tuple([lineCountSchema, lineCountSchema]).optional(),
  /** The change was applied although Pi's record shows no success. */
  applied: z.literal(true).optional()
});

export type NestedChangeRecord = z.infer<typeof nestedChangeSchema>;

const callRecordSchema = z.object({
  /** Pi entry ID of the assistant message that holds the call. */
  entry: idSchema,
  toolCallId: idSchema,
  /** The call was cancelled, for any tool; Pi's result has no cancellation flag. */
  cancelled: z.literal(true).optional(),
  /**
   * Native observation saw an operation; the fields below refine it. Pi's duration shows only that the tool ran, not that the operation started.
   */
  operation: z.literal(true).optional(),
  /** The observed operation failed, independently of Pi's result and call cancellation. */
  outcome: z.literal("failure").optional(),
  /** Shell only: the observed exit code, omitted when Pi's success implies 0; null when the process had no exit code. */
  exitCode: z.int().nullable().optional(),
  timedOut: z.literal(true).optional(),
  /** edit and write: the change was applied although Pi reported failure. */
  applied: z.literal(true).optional(),
  change: z
    .union([
      // Replay derives a creation's patch from the content argument when the record omits it.
      z.object({
        kind: z.literal("creation"),
        patch: patchSchema.optional(),
        unavailable: z.undefined().optional()
      }),
      z.object({
        kind: z.literal("modification"),
        patch: patchSchema,
        unavailable: z.undefined().optional()
      }),
      z.object({
        kind: z.enum(["creation", "modification"]),
        patch: z.undefined().optional(),
        /** Why the change has no patch. */
        unavailable: z.custom<ChangeUnavailableReason>(isChangeUnavailableReason)
      })
    ])
    .optional(),
  /** Nested `edit` and `write` calls, by the key of their ID. */
  nested: z.record(nestedKeySchema, nestedChangeSchema).optional()
});

export type CallRecord = z.infer<typeof callRecordSchema>;

function bounded(value: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_RECORD_BYTES;
}

/** The whole original value counts toward the limit, including unknown fields. */
export function parseCallRecord(value: unknown): CallRecord | undefined {
  const parsed = callRecordSchema.safeParse(value);

  return parsed.success && bounded(value) ? parsed.data : undefined;
}
