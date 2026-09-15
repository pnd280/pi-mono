import { isDeepStrictEqual } from "node:util";

import {
  isRecord,
  limits,
  PromptError,
  type Collection,
  type Document,
  type Occurrence,
  type Snapshot,
  type StoredEntry
} from "../model.ts";

export function encode(document: Document): string {
  return JSON.stringify(document, null, 2) + "\n";
}

export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
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
  return isRecord(value) && typeof value.text === "string" && value.text.trim().length > 0;
}

export function snapshot(
  collection: Collection,
  document: Document,
  bytes: number,
  warnings: string[] = []
): Snapshot {
  const ids = new Map<string, number>();

  for (const entry of document.entries) {
    if (validId(entry.id))
      ids.set(entry.id.toLowerCase(), (ids.get(entry.id.toLowerCase()) ?? 0) + 1);
  }

  const entries: Occurrence[] = document.entries.map((source, index) => ({
    source,
    number: index + 1,
    key:
      validId(source.id) && ids.get(source.id.toLowerCase()) === 1
        ? source.id.toLowerCase()
        : `unresolved:${index}`,
    identity: !validId(source.id)
      ? "invalid"
      : ids.get(source.id.toLowerCase()) === 1
        ? "valid"
        : "ambiguous"
  }));
  const invalid = entries.some((entry) => entry.identity === "invalid");
  const recovery =
    collection === "drafts" &&
    (bytes > limits.draftFile ||
      entries.length > limits.draftCount ||
      entries.some((entry) => Buffer.byteLength(entry.source.text) > limits.draftText));

  if (invalid)
    warnings.push(`Invalid occurrence IDs: collection is read-only. ${reductionGuidance}`);
  if (entries.some((entry) => entry.identity === "ambiguous"))
    warnings.push(
      "Duplicate occurrence IDs cannot be deleted. Repair IDs manually with sessions stopped."
    );
  if (recovery) warnings.push("Draft capacity recovery: deletions only; additions are disabled.");

  return {
    status: "ready",
    collection,
    document,
    entries,
    bytes,
    warnings,
    access: invalid ? "read-only" : recovery ? "delete-only" : "writable"
  };
}

export function parseDocument(collection: Collection, cwd: string, raw?: Buffer): Snapshot {
  if (raw === undefined) return snapshot(collection, { version: 1, cwd, entries: [] }, 0);
  if (raw.length > limits.read)
    throw new PromptError(`Collection exceeds the 64 MiB read bound. ${reductionGuidance}`);
  const value = decode(raw);

  if (!isRecord(value) || value.version !== 1 || value.cwd !== cwd || !Array.isArray(value.entries))
    throw new PromptError(
      `Unsupported version, wrong directory, or invalid collection structure. ${reductionGuidance}`
    );
  const warnings: string[] = [];
  const entries: StoredEntry[] = [];

  if (collection === "drafts" && value.entries.length > limits.recoveryCount)
    throw new PromptError(`Drafts exceed the 5,000-record recovery bound. ${reductionGuidance}`);

  for (const entry of value.entries) {
    if (collection === "drafts" && Buffer.byteLength(JSON.stringify(entry)) > limits.recoveryRecord)
      throw new PromptError(`Draft record exceeds the 8 MiB recovery bound. ${reductionGuidance}`);

    if (
      !usable(entry) ||
      (collection === "history" && Buffer.byteLength(entry.text) > limits.historyText)
    ) {
      if (!warnings.length)
        warnings.push("Unusable records were ignored; a successful mutation may omit them.");
      continue;
    }

    entries.push(entry);
  }

  const result = snapshot(collection, { ...value, version: 1, cwd, entries }, raw.length, warnings);

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

export function deleteTarget(current: Snapshot, target: Occurrence): StoredEntry[] {
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
