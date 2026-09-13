import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { CallReference, ChangeFact, DisplayFact, OperationFact } from "./display-model.ts";

export const METADATA_TYPE = "pi-tool-display.facts";

export const MAX_RECORD_BYTES = 160 * 1024;

export interface DisplayRecord {
  version: 1;
  call: CallReference;
  adapter: string;
  fact: DisplayFact;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function validReference(
  call: Record<string, unknown>
): call is Record<string, unknown> & CallReference {
  return !(
    typeof call.toolCallId !== "string" ||
    call.toolCallId.length > 1024 ||
    !finite(call.messageTimestamp) ||
    typeof call.contentIndex !== "number" ||
    !Number.isSafeInteger(call.contentIndex) ||
    call.contentIndex < 0 ||
    (call.messageEntryId !== undefined && typeof call.messageEntryId !== "string")
  );
}

function validOperation(
  fact: Record<string, unknown>
): fact is Record<string, unknown> & OperationFact {
  return !(
    fact.kind !== "operation" ||
    fact.availability !== "available" ||
    !finite(fact.durationMs) ||
    typeof fact.outcome !== "string" ||
    !["success", "failure", "cancelled", "unavailable"].includes(fact.outcome) ||
    (fact.exitCode !== undefined &&
      fact.exitCode !== null &&
      !Number.isSafeInteger(fact.exitCode)) ||
    (fact.timedOut !== undefined && typeof fact.timedOut !== "boolean")
  );
}

function validChange(fact: Record<string, unknown>): fact is Record<string, unknown> & ChangeFact {
  return !(
    fact.kind !== "change" ||
    (fact.availability !== "available" && fact.availability !== "unavailable") ||
    (fact.availability === "available" && typeof fact.patch !== "string") ||
    (fact.patch !== undefined &&
      (typeof fact.patch !== "string" || Buffer.byteLength(fact.patch) > 128 * 1024)) ||
    (fact.reason !== undefined && (typeof fact.reason !== "string" || fact.reason.length > 256)) ||
    (fact.change !== undefined && fact.change !== "creation" && fact.change !== "modification")
  );
}

function validFact(fact: Record<string, unknown>): fact is Record<string, unknown> & DisplayFact {
  if (fact.kind === "operation") return validOperation(fact);
  if (fact.kind === "change") return validChange(fact);

  if (fact.kind === "saved-output") {
    if (
      fact.availability !== "available" ||
      typeof fact.path !== "string" ||
      !fact.path.length ||
      fact.path.length > 4096
    )
      return false;

    return true;
  }

  return false;
}

function validDisplayRecord(value: unknown): value is DisplayRecord {
  if (
    !object(value) ||
    value.version !== 1 ||
    !object(value.call) ||
    !object(value.fact) ||
    typeof value.adapter !== "string" ||
    value.adapter.length > 128
  )
    return false;

  return validReference(value.call) && validFact(value.fact);
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

export function referenceKey(call: CallReference): string {
  return JSON.stringify([call.messageTimestamp, call.contentIndex, call.toolCallId]);
}

/** The caller supplies only the selected ancestry, not all branches or only the latest leaf. */
export function readDisplayRecords(branch: readonly SessionEntry[]): DisplayRecord[] {
  const records = new Map<string, DisplayRecord>();

  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== METADATA_TYPE) continue;
    const record = parseDisplayRecord(entry.data);
    if (!record) continue;

    if (record.call.messageEntryId) {
      const source = branch.find((candidate) => candidate.id === record.call.messageEntryId);
      if (!source || source.type !== "message" || source.message.role !== "assistant") continue;
      const content = source.message.content[record.call.contentIndex];
      if (
        source.message.timestamp !== record.call.messageTimestamp ||
        content?.type !== "toolCall" ||
        content.id !== record.call.toolCallId
      )
        continue;
    }

    records.set(`${referenceKey(record.call)}:${record.adapter}:${record.fact.kind}`, record);
  }

  return [...records.values()];
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
