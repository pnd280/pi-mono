import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { CallReference } from "../contracts.ts";

export const TRANSCRIPT_TYPE = "pi-tool-display.transcript";

export const TRANSCRIPT_RECORD_BYTES = 16 * 1024;

export const SUMMARY_SEGMENTS = 64;

const bounded = (bytes: number) =>
  z
    .string()
    .min(1)
    .max(bytes)
    .refine((text) => Buffer.byteLength(text) <= bytes);
const id = bounded(1024);
const count = z.int().nonnegative();

export const transcriptCallSchema = z.object({
  messageEntryId: id,
  messageTimestamp: z.number().nonnegative(),
  contentIndex: count,
  toolCallId: id
});

const sourceSchema = z.object({
  source: bounded(4096),
  path: bounded(4096),
  scope: z.enum(["user", "project", "temporary"]),
  origin: z.enum(["package", "top-level"])
});
const base = z.object({ version: z.literal(1), sessionId: id, generation: id });
const selection = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adapter"), id: bounded(128), version: count }),
  z.object({ kind: z.literal("generic") }),
  z.object({ kind: z.literal("original") })
]);
const segmentSchema = z
  .object({
    category: bounded(1280),
    count,
    failed: count,
    cancelled: count,
    unavailable: count
  })
  .refine((segment) => segment.failed + segment.cancelled + segment.unavailable <= segment.count);
const transcriptSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("runtime") }),
  base.extend({
    kind: z.literal("call"),
    call: transcriptCallSchema,
    name: id,
    revision: count,
    selection,
    source: sourceSchema.optional()
  }),
  base.extend({
    kind: z.literal("boundary"),
    id,
    call: transcriptCallSchema,
    revision: count,
    boundary: z.enum(["group", "run"])
  }),
  base
    .extend({
      kind: z.literal("run"),
      id,
      revision: count,
      first: transcriptCallSchema,
      last: transcriptCallSchema,
      watermark: id,
      closed: z.boolean(),
      final: z.boolean(),
      segments: z.array(segmentSchema).max(SUMMARY_SEGMENTS),
      omittedSegments: count,
      omittedItems: count
    })
    .refine((record) => !record.final || record.closed)
]);

export type TranscriptRecord = z.infer<typeof transcriptSchema>;

export type CallRecord = Extract<TranscriptRecord, { kind: "call" }>;

export type RunRecord = Extract<TranscriptRecord, { kind: "run" }>;

/** Measure the original value before stripping unknown fields; expose no raw validation errors. */
export function parseTranscriptRecord(value: unknown): TranscriptRecord | undefined {
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > TRANSCRIPT_RECORD_BYTES) return;

    return transcriptSchema.safeParse(value).data;
  } catch {
    return;
  }
}

export function sourceCall(
  entries: ReadonlyMap<string, SessionEntry>,
  reference: CallReference,
  name?: string
) {
  if (!reference.messageEntryId) return;
  const entry = entries.get(reference.messageEntryId);
  if (
    entry?.type !== "message" ||
    entry.message.role !== "assistant" ||
    entry.message.timestamp !== reference.messageTimestamp
  )
    return;
  const call = entry.message.content[reference.contentIndex];
  if (
    call?.type !== "toolCall" ||
    call.id !== reference.toolCallId ||
    (name !== undefined && call.name !== name)
  )
    return;

  return call;
}

/** A committed result belongs to the source call only until its ID is reused. */
export function resultAfter(
  reference: CallReference,
  name: string,
  entries: readonly SessionEntry[]
) {
  let started = false;

  for (const entry of entries) {
    if (entry.id === reference.messageEntryId) {
      started = true;

      continue;
    }

    if (!started || entry.type !== "message") continue;
    if (
      entry.message.role === "toolResult" &&
      entry.message.toolCallId === reference.toolCallId &&
      entry.message.toolName === name
    )
      return entry.message;
    if (
      entry.message.role === "assistant" &&
      entry.message.content.some(
        (block) => block.type === "toolCall" && block.id === reference.toolCallId
      )
    )
      return;
  }

  return;
}

/** Records are assertions by the producer; a matching runtime and source entry are mandatory. */
export class TranscriptRecordIndex {
  readonly calls = new Map<string, CallRecord>();
  readonly runs = new Map<string, { entryId: string; record: RunRecord }>();
  readonly boundaries: Extract<TranscriptRecord, { kind: "boundary" }>[] = [];
  readonly runtimes = new Map<string, string>();
  readonly sources: ReadonlyMap<string, SessionEntry>;

  constructor(entries: readonly SessionEntry[]) {
    this.sources = new Map(entries.map((entry) => [entry.id, entry]));

    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== TRANSCRIPT_TYPE) continue;
      const record = parseTranscriptRecord(entry.data);
      if (!record) continue;

      if (record.kind === "runtime") {
        this.runtimes.set(record.generation, record.sessionId);

        continue;
      }

      if (this.runtimes.get(record.generation) !== record.sessionId) continue;

      if (record.kind === "call") {
        if (!sourceCall(this.sources, record.call, record.name)) continue;
        const key = recordCallKey(record.call);
        const previous = this.calls.get(key);
        if (!previous || previous.revision < record.revision) this.calls.set(key, record);
      } else if (record.kind === "boundary") {
        if (sourceCall(this.sources, record.call)) this.boundaries.push(record);
      } else {
        if (
          !sourceCall(this.sources, record.first) ||
          !sourceCall(this.sources, record.last) ||
          !this.sources.has(record.watermark)
        )
          continue;
        const key = `${record.generation}\0${record.id}`;
        const previous = this.runs.get(key)?.record;
        if (!previous || (!previous.final && previous.revision < record.revision))
          this.runs.set(key, { entryId: entry.id, record });
      }
    }
  }
}

export function recordCallKey(call: CallReference): string {
  return JSON.stringify([
    call.messageEntryId,
    call.messageTimestamp,
    call.contentIndex,
    call.toolCallId
  ]);
}
