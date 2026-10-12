import { z } from "zod";

import { PROTOCOL_VERSION, RECORD_MAX_BYTES } from "./constants.ts";
import { taskRecordSchema } from "./records.ts";
import { detailsSchema } from "./result.ts";

/** Protocol messages are ephemeral. Pi never persists them in either session. */
const id = z.string().min(1).max(1024);
const version = z.literal(PROTOCOL_VERSION);
const slot = z.object({ request_id: id, owner: id });

/** `/subagents begin`: the supervisor starts one run of a child. */
export const beginSchema = z.object({
  version,
  task_id: id,
  run_id: id,
  /** The run to continue; null for a new task. */
  previous_run_id: id.nullable()
});

/** `/subagents slot`: a capacity reply that travels down to the requesting supervisor. */
export const slotReplySchema = slot.extend({
  granted: z.boolean(),
  error: z.string().max(4096).optional()
});

const controlRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("input"),
    task_id: id,
    prompt: z.string().min(1),
    delivery: z.enum(["steer", "follow_up"])
  }),
  z.object({ kind: z.literal("abort"), task_id: id, reason: z.string().min(1) }),
  z.object({ kind: z.literal("background"), task_id: id })
]);

/** `/subagents control`: input, abort, or promotion for a task that a descendant supervisor runs. */
export const controlSchema = z.intersection(controlRequestSchema, z.object({ request_id: id }));

export type ControlRequest = z.infer<typeof controlRequestSchema>;

export type Begin = z.infer<typeof beginSchema>;

export type SlotReply = z.infer<typeof slotReplySchema>;

export type Control = z.infer<typeof controlSchema>;

/** Messages from a child to its supervisor, sent as the child's protocol status. */
export const childMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("begun"),
    version,
    task_id: id,
    run_id: id,
    session_id: id,
    session_file: z.string().min(1),
    marker_id: id,
    /** The entry that the run continues from; null when the session has no entries. */
    leaf_id: id.nullable(),
    /** The continued history ends with a tool call that has no result. */
    interrupted: z.boolean()
  }),
  z.object({ kind: z.literal("begin-failed"), run_id: id, error: z.string().max(4096) }),
  z.object({ kind: z.literal("task"), record: taskRecordSchema }),
  slot.extend({ kind: z.literal("slot-request") }),
  slot.extend({ kind: z.literal("slot-release") }),
  z.object({
    kind: z.literal("control-reply"),
    request_id: id,
    details: detailsSchema.optional(),
    record: taskRecordSchema.optional(),
    error: z.string().max(4096).optional()
  })
]);

export type ChildMessage = z.infer<typeof childMessageSchema>;

const MESSAGE_MAX_BYTES = RECORD_MAX_BYTES + 64 * 1024;

/** An error for a protocol reply, within the error field's limit. */
export function errorText(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : fallback).slice(0, 4096);
}

/** Serialise a protocol payload, rejecting one over the protocol budget. */
export function encode(value: unknown): string {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > MESSAGE_MAX_BYTES)
    throw new Error("Subagent message exceeds the protocol budget");

  return text;
}

/** Parse a protocol payload from its JSON text; invalid or oversized text gives undefined. */
export function decode<T>(schema: z.ZodType<T>, text: string): T | undefined {
  if (Buffer.byteLength(text) > MESSAGE_MAX_BYTES) return undefined;

  try {
    return schema.safeParse(JSON.parse(text)).data;
  } catch {
    return undefined;
  }
}
