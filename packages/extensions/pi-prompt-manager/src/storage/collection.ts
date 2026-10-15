import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { PrivateFileUpdate } from "@pi-mono/libs/private-files";
import { z } from "zod";

import {
  captureText,
  documentSchema,
  draftTextSchema,
  historyTextSchema,
  storedEntrySchema,
  limits,
  PromptError,
  type Collection,
  type Document,
  type Mutation,
  type Occurrence,
  type Snapshot,
  type StoredEntry
} from "../model.ts";

function encode(document: Document): string {
  return JSON.stringify(document, null, 2) + "\n";
}

// Recovery accepts UUID-shaped IDs without imposing a UUID version or variant.
const idSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const jsonValueSchema = z.json();
const documentEnvelopeSchema = documentSchema.extend({ entries: z.array(z.unknown()) });

function validId(value: unknown): value is string {
  return idSchema.safeParse(value).success;
}

export const reductionGuidance =
  "Back up the collection and manually reduce or repair it with all participating Pi sessions stopped.";

function decode(raw: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new PromptError(`Collection contains invalid UTF-8 or JSON. ${reductionGuidance}`);
  }
}

function usable(value: unknown): value is StoredEntry {
  return storedEntrySchema.safeParse(value).success;
}

function validDocument(value: unknown): value is z.infer<typeof documentEnvelopeSchema> {
  // Keep original JSON fields, including names Zod omits from parsed object copies.
  return documentEnvelopeSchema.safeParse(value).success;
}

function snapshot(
  collection: Collection,
  document: Document,
  bytes: number,
  warnings: string[] = [],
  serializationSafe = true
): Snapshot {
  const ids = new Map<string, number>();

  for (const entry of document.entries) {
    if (validId(entry.id))
      ids.set(entry.id.toLowerCase(), (ids.get(entry.id.toLowerCase()) ?? 0) + 1);
  }

  const entries: Occurrence[] = document.entries.map((source, index) => {
    let identity: Occurrence["identity"] = "invalid";
    if (validId(source.id))
      identity = ids.get(source.id.toLowerCase()) === 1 ? "valid" : "ambiguous";

    return {
      source,
      key:
        validId(source.id) && ids.get(source.id.toLowerCase()) === 1
          ? source.id.toLowerCase()
          : `unresolved:${index}`,
      identity
    };
  });
  const invalid = entries.some((entry) => entry.identity === "invalid");
  const recovery =
    collection === "drafts" &&
    (bytes > limits.draftFile ||
      entries.length > limits.draftCount ||
      entries.some((entry) => Buffer.byteLength(entry.source.text) > limits.draftText));

  if (invalid)
    warnings.push(`Invalid occurrence IDs: collection is read-only. ${reductionGuidance}`);
  if (!serializationSafe)
    warnings.push(`Non-finite numeric values: collection is read-only. ${reductionGuidance}`);
  if (entries.some((entry) => entry.identity === "ambiguous"))
    warnings.push(
      "Duplicate occurrence IDs cannot be deleted. Repair IDs manually with sessions stopped."
    );
  if (recovery) warnings.push("Draft capacity recovery: deletions only; additions are disabled.");
  let access: Snapshot["access"] = "writable";
  if (invalid || !serializationSafe) access = "read-only";
  else if (recovery) access = "delete-only";

  return {
    status: "ready",
    collection,
    document,
    entries,
    bytes,
    warnings,
    access
  };
}

export function readCollection(collection: Collection, cwd: string, raw?: Buffer): Snapshot {
  if (raw === undefined) return snapshot(collection, { version: 1, cwd, entries: [] }, 0);
  if (raw.length > limits.read)
    throw new PromptError(`Collection exceeds the 64 MiB read bound. ${reductionGuidance}`);
  const value = decode(raw);

  if (!validDocument(value) || value.cwd !== cwd)
    throw new PromptError(
      `Unsupported version, wrong directory, or invalid collection structure. ${reductionGuidance}`
    );
  if (value.entries.length > limits.recoveryCount)
    throw new PromptError(
      `${collection === "drafts" ? "Drafts exceed" : "History exceeds"} the 5,000-record recovery bound. ${reductionGuidance}`
    );

  const warnings: string[] = [];
  const serializationSafe = jsonValueSchema.safeParse(value).success;
  const entries: StoredEntry[] = [];

  for (const entry of value.entries) {
    if (collection === "drafts" && Buffer.byteLength(JSON.stringify(entry)) > limits.recoveryRecord)
      throw new PromptError(`Draft record exceeds the 8 MiB recovery bound. ${reductionGuidance}`);

    if (
      !usable(entry) ||
      (collection === "history" && !historyTextSchema.safeParse(entry.text).success)
    ) {
      if (!warnings.length)
        warnings.push("Unusable records were ignored; a successful mutation may omit them.");
      continue;
    }

    entries.push(entry);
  }

  const result = snapshot(
    collection,
    { ...value, version: 1, cwd, entries },
    raw.length,
    warnings,
    serializationSafe
  );

  // Invalid/blank records still count against normal capacity until a deletion repairs the file.
  if (
    collection === "drafts" &&
    value.entries.length > limits.draftCount &&
    result.access === "writable"
  ) {
    result.access = "delete-only";
    result.warnings.push("Draft capacity recovery: deletions only; additions are disabled.");
  }

  return result;
}

function deleteTarget(current: Snapshot, target: Occurrence): StoredEntry[] {
  const id = target.source.id;

  if (!validId(id) || target.identity !== "valid")
    throw new PromptError(
      "Selected occurrence has invalid or ambiguous identity; deletion refused."
    );
  const matches = current.entries.filter(
    (entry) => validId(entry.source.id) && entry.source.id.toLowerCase() === id.toLowerCase()
  );
  const latest = matches[0];

  if (
    matches.length !== 1 ||
    !latest ||
    latest.source.text !== target.source.text ||
    !isDeepStrictEqual(latest.source.recordedAt, target.source.recordedAt) ||
    Object.hasOwn(latest.source, "recordedAt") !== Object.hasOwn(target.source, "recordedAt")
  )
    throw new PromptError(
      "Selected occurrence is missing, changed, or ambiguous; deletion refused."
    );

  return current.document.entries.filter((entry) => entry !== latest.source);
}

function addDraft(current: Snapshot, incoming: StoredEntry): Document {
  if (current.access !== "writable")
    throw new PromptError(
      "Drafts are in recovery or read-only; additions are disabled. Back up and repair with sessions stopped, or delete recoverable occurrences."
    );
  if (!storedEntrySchema.shape.text.safeParse(incoming.text).success)
    throw new PromptError("Draft text is blank.");
  if (!draftTextSchema.safeParse(incoming.text).success)
    throw new PromptError("Draft exceeds 256 KiB; nothing was saved.");
  if (current.document.entries.length >= limits.draftCount) throw draftCapacityError();

  return { ...current.document, entries: [incoming, ...current.document.entries] };
}

function draftCapacityError() {
  return new PromptError(
    "Draft capacity reached (1,000 entries / 16 MiB). Delete drafts before saving more; existing drafts were not changed."
  );
}

/** Prefix only: never skip a large newer record to fit an older one. */
function retainHistory(
  document: Document,
  incoming: StoredEntry,
  retention: number
): Document | undefined {
  if (document.entries[0]?.text.trim() === incoming.text.trim()) return undefined;
  const candidates = [incoming, ...document.entries].slice(0, retention);
  // Replacing [] with a nonempty array adds two bytes, plus each indented
  // record and its comma/newline. JSON escapes source newlines before counting.
  let bytes = Buffer.byteLength(encode({ ...document, entries: [] })) + 2;
  let count = 0;

  for (const candidate of candidates) {
    const encoded = JSON.stringify(candidate, null, 2);
    let lines = 1;
    for (let index = encoded.indexOf("\n"); index !== -1; index = encoded.indexOf("\n", index + 1))
      lines++;
    bytes += Buffer.byteLength(encoded) + lines * 4 + 2;
    if (bytes > limits.historyFile) break;
    count++;
  }

  if (count === 0)
    throw new PromptError(
      "History metadata exceeds collection capacity; manually reduce the file with sessions stopped."
    );

  return { ...document, entries: candidates.slice(0, count) };
}

function apply(current: Snapshot, operation: Mutation, retention: number): Document | undefined {
  if (current.access === "read-only")
    throw new PromptError("Collection is read-only. Back up and repair with sessions stopped.");
  if (operation.kind === "delete")
    return { ...current.document, entries: deleteTarget(current, operation.target) };
  const text = current.collection === "history" ? captureText(operation.text) : operation.text;

  if (text === undefined) return undefined;
  const entry = { id: randomUUID(), text, recordedAt: operation.recordedAt };

  return current.collection === "history"
    ? retainHistory(current.document, entry, retention)
    : addDraft(current, entry);
}

/** Plan a replacement from the latest locked bytes without performing filesystem I/O. */
export function updateCollection({
  collection,
  cwd,
  raw,
  operation,
  retention
}: {
  collection: Collection;
  cwd: string;
  raw: Buffer | undefined;
  operation: Mutation;
  retention: number;
}): PrivateFileUpdate<Snapshot> {
  const current = readCollection(collection, cwd, raw);
  const document = apply(current, operation, retention);
  if (document === undefined) return { status: "unchanged", value: current };
  const content = encode(document);
  const bytes = Buffer.byteLength(content);
  const recoveryDeletion =
    collection === "drafts" && current.access === "delete-only" && operation.kind === "delete";

  if (
    recoveryDeletion
      ? bytes >= current.bytes
      : bytes > (collection === "history" ? limits.historyFile : limits.draftFile)
  ) {
    if (collection === "drafts" && operation.kind === "add") throw draftCapacityError();
    throw new PromptError(
      "Mutation exceeds collection capacity or would not reduce recovery file size; nothing was changed."
    );
  }

  return { status: "replace", content, value: snapshot(collection, document, bytes) };
}
