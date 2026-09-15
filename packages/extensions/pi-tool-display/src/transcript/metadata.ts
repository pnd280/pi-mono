import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { callKey, type CallReference, type DisplayFact } from "../contracts.ts";
import { PATCH_BYTES } from "../diff.ts";
import { record } from "../values.ts";

export const METADATA_TYPE = "pi-tool-display.facts";

export const MAX_RECORD_BYTES = 160 * 1024;

const callReferenceSchema = z.object({
  toolCallId: z.string().max(1024),
  messageTimestamp: z.number().nonnegative(),
  contentIndex: z.int().nonnegative(),
  messageEntryId: z.string().optional()
});

const displayRecordSchema = z.object({
  version: z.literal(1),
  call: callReferenceSchema,
  adapter: z.string().max(128),
  fact: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cancellation"),
      availability: z.literal("available")
    }),
    z.object({
      kind: z.literal("operation"),
      availability: z.literal("available"),
      durationMs: z.number().nonnegative(),
      outcome: z.enum(["success", "failure", "cancelled", "unavailable"]),
      exitCode: z.int().nullable().optional(),
      timedOut: z.boolean().optional()
    }),
    z
      .object({
        kind: z.literal("change"),
        availability: z.enum(["available", "unavailable"]),
        patch: z
          .string()
          .refine((patch) => Buffer.byteLength(patch) <= PATCH_BYTES)
          .optional(),
        reason: z.string().max(256).optional(),
        change: z.enum(["creation", "modification"]).optional()
      })
      .refine((fact) => fact.availability !== "available" || fact.patch !== undefined),
    z.object({
      kind: z.literal("saved-output"),
      availability: z.literal("available"),
      path: z.string().min(1).max(4096)
    })
  ])
});

export type DisplayRecord = z.infer<typeof displayRecordSchema>;

function validDisplayRecord(value: unknown): value is DisplayRecord {
  return displayRecordSchema.safeParse(value).success;
}

export function parseDisplayRecord(value: unknown): DisplayRecord | undefined {
  if (!validDisplayRecord(value)) return undefined;

  try {
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_RECORD_BYTES) return undefined;
  } catch {
    return undefined;
  }

  return value;
}

/** Index only the selected ancestry. Payload validation is deferred until a
 * retained call requests its facts, so compacted-away patches are never serialized.
 */
export class DisplayRecordIndex {
  private sources: Map<string, SessionEntry>;
  private pending = new Map<string, unknown[]>();
  private parsed = new Map<string, readonly DisplayRecord[]>();

  constructor(branch: readonly SessionEntry[]) {
    this.sources = new Map(branch.map((entry) => [entry.id, entry]));

    for (const entry of branch) {
      if (entry.type !== "custom" || entry.customType !== METADATA_TYPE) continue;
      const call = callReferenceSchema.safeParse(record(entry.data).call).data;
      if (!call) continue;
      const key = callKey("history", call);
      const values = this.pending.get(key) ?? [];
      values.push(entry.data);
      this.pending.set(key, values);
    }
  }

  forCall(call: CallReference): readonly DisplayRecord[] {
    const key = callKey("history", call);
    const cached = this.parsed.get(key);
    if (cached) return cached;
    const records = new Map<string, Map<DisplayFact["kind"], DisplayRecord>>();

    for (const value of this.pending.get(key) ?? []) {
      const record = parseDisplayRecord(value);
      if (!record || callKey("history", record.call) !== key) continue;

      if (record.call.messageEntryId) {
        const source = this.sources.get(record.call.messageEntryId);
        if (!source || source.type !== "message" || source.message.role !== "assistant") continue;
        const content = source.message.content[record.call.contentIndex];
        if (
          source.message.timestamp !== record.call.messageTimestamp ||
          content?.type !== "toolCall" ||
          content.id !== record.call.toolCallId
        )
          continue;
      }

      const facts = records.get(record.adapter) ?? new Map<DisplayFact["kind"], DisplayRecord>();
      facts.set(record.fact.kind, record);
      records.set(record.adapter, facts);
    }

    const facts = [...records.values()].flatMap((facts) => [...facts.values()]);
    this.pending.delete(key);
    this.parsed.set(key, facts);

    return facts;
  }
}

/** Best effort: collection and persistence must never change the delegated result. */
export function persistDisplayFact(
  append: ExtensionAPI["appendEntry"],
  call: CallReference,
  adapter: string,
  fact: DisplayFact
): void {
  try {
    const record = parseDisplayRecord({ version: 1, call, adapter, fact });
    if (record) append(METADATA_TYPE, record);
  } catch {
    /* Pi execution remains authoritative. */
  }
}
