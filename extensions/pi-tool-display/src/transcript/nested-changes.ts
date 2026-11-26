import { z } from "zod";

import { nativeFilePath } from "../adapters/native/invocation.ts";
import type { ChangedLines, NestedChange, NestedFact, Outcome } from "../contracts.ts";
import { changedLines, creationPatch } from "../diff.ts";
import { record } from "../values.ts";
import type { CallRecord, NestedChangeRecord } from "./metadata.ts";

/** Adapters whose calls count the file changes of their nested `edit` and `write` calls. */
export const NESTED_CHANGE_ADAPTERS: ReadonlySet<string> = new Set(["builtin:codemode"]);

const NESTED_CHANGE_TOOLS: ReadonlySet<string> = new Set(["edit", "write"]);

/** One entry of the `nestedCalls` record that Pi keeps on a tool result message. */
const piNestedCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absent when Pi dropped arguments over its size limits. */
  arguments: z.unknown().optional(),
  status: z.enum(["ok", "error", "unfinished"])
});

export type PiNestedCall = z.infer<typeof piNestedCallSchema>;

/** Pi's records of the calls nested under `toolCallId` at any depth, by key; invalid entries are skipped. */
export function piNestedCalls(result: unknown, toolCallId: string): Map<string, PiNestedCall> {
  const calls = record(record(result).nestedCalls).calls;
  const entries = new Map<string, PiNestedCall>();
  if (!Array.isArray(calls)) return entries;

  for (const value of calls) {
    const call = piNestedCallSchema.safeParse(value).data;
    if (call) entries.set(call.id.slice(toolCallId.length + 1), call);
  }

  return entries;
}

const PI_OUTCOMES = {
  ok: "success",
  error: "failure",
  // Pi saves the record when its caller ends, so an unfinished call was abandoned.
  unfinished: "cancelled"
} as const satisfies Record<PiNestedCall["status"], Outcome>;

/** Every line of a created file's content argument is added. */
function creationLines(call: PiNestedCall | undefined): ChangedLines | undefined {
  const content = call?.name === "write" ? record(call.arguments).content : undefined;

  return typeof content === "string" ? changedLines(creationPatch(content), undefined) : undefined;
}

const sameLines = (left: ChangedLines | undefined, right: ChangedLines) =>
  left?.added === right.added && left.removed === right.removed;

/** Pi's record shows success, or the change was applied and Pi reported no failure, like a direct call. */
function succeeded(call: PiNestedCall | undefined, fact: NestedFact | undefined): boolean {
  return call?.status === "ok" || (fact?.applied === true && call?.status !== "error");
}

/**
 * The file changes of nested calls, live and on replay alike. They count only while `native` verifies the tool; a call past Pi's record limit has no name, so it needs both.
 */
export function nestedChanges(
  pi: ReadonlyMap<string, PiNestedCall>,
  facts: ReadonlyMap<string, NestedFact>,
  native: (name: string) => boolean
): NestedChange[] {
  const changes: NestedChange[] = [];

  for (const key of new Set([...pi.keys(), ...facts.keys()])) {
    const call = pi.get(key);
    const fact = facts.get(key);
    if (call ? !NESTED_CHANGE_TOOLS.has(call.name) || !native(call.name) : !fact) continue;
    if (!call && ![...NESTED_CHANGE_TOOLS].every(native)) continue;
    const outcome = succeeded(call, fact) ? "success" : call && PI_OUTCOMES[call.status];
    if (!outcome) continue;
    const path = nativeFilePath(call?.arguments) ?? fact?.path;
    const created = fact?.created === true;
    const lines =
      outcome === "success"
        ? (fact?.lines ?? (created ? creationLines(call) : undefined))
        : undefined;

    changes.push({
      ...(path === undefined ? {} : { path }),
      created,
      outcome,
      ...(lines ? { lines } : {})
    });
  }

  return changes;
}

/** The observed facts that replay cannot derive from Pi's record; undefined when there are none. */
export function nestedRecord(
  pi: ReadonlyMap<string, PiNestedCall>,
  facts: ReadonlyMap<string, NestedFact>
): Record<string, NestedChangeRecord> | undefined {
  const nested: Record<string, NestedChangeRecord> = {};

  for (const [key, fact] of facts) {
    const call = pi.get(key);
    const success = succeeded(call, fact);
    // Replay ignores a call that Pi's record lacks unless it was applied.
    if (!call && !success) continue;
    const item: NestedChangeRecord = {};
    if (fact.path !== undefined && nativeFilePath(call?.arguments) === undefined)
      item.path = fact.path;
    if (fact.created) item.created = true;
    if (fact.applied && call?.status !== "ok" && call?.status !== "error") item.applied = true;
    if (
      success &&
      fact.lines &&
      !sameLines(fact.created ? creationLines(call) : undefined, fact.lines)
    )
      item.lines = [fact.lines.added, fact.lines.removed];
    if (Object.keys(item).length) nested[key] = item;
  }

  return Object.keys(nested).length ? nested : undefined;
}

/** Saved nested facts, by key. */
export function recordedNestedFacts(nested: CallRecord["nested"]): Map<string, NestedFact> {
  return new Map(
    Object.entries(nested ?? {}).map(([key, item]) => [
      key,
      {
        ...(item.path === undefined ? {} : { path: item.path }),
        ...(item.created ? { created: true } : {}),
        ...(item.lines ? { lines: { added: item.lines[0], removed: item.lines[1] } } : {}),
        ...(item.applied ? { applied: true } : {})
      }
    ])
  );
}
