import { constants } from "node:fs";
import { open } from "node:fs/promises";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { MARKER_ENTRY } from "../constants.ts";
import type { TaskRecord } from "../tasks/records.ts";

const headerSchema = z.object({
  type: z.literal("session"),
  id: z.string().min(1),
  cwd: z.string().min(1)
});

const entrySchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  parentId: z.string().min(1).nullable()
});

const markerSchema = z.object({ run_id: z.string().min(1) });

const UNAVAILABLE = "Subagent session history is unavailable";

/** The largest child session file that readers parse. */
const SESSION_MAX_BYTES = 64 * 1024 * 1024;

type Parsed = {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  dev: number;
  ino: number;
  id: string;
  cwd: string;
  entries: SessionEntry[];
};

/** Parsed files by path, evicted oldest first when their total size exceeds the read limit. */
const cache = new Map<string, Parsed>();

function remember(path: string, parsed: Parsed): void {
  cache.delete(path);
  cache.set(path, parsed);
  let total = 0;
  for (const value of cache.values()) total += value.size;

  for (const [key, value] of cache) {
    if (total <= SESSION_MAX_BYTES || key === path) break;
    cache.delete(key);
    total -= value.size;
  }
}

function isMarker(entry: SessionEntry, runId?: string): boolean {
  if (entry.type !== "custom" || entry.customType !== MARKER_ENTRY) return false;

  return runId === undefined || markerSchema.safeParse(entry.data).data?.run_id === runId;
}

/**
 * A run's final leaf: the last appended entry whose nearest marker ancestor is the run's marker.
 * A manual continuation of the file's last run therefore extends that run.
 */
function runLeaf(entries: readonly SessionEntry[], runId: string): string | undefined {
  const start = entries.findIndex((entry) => isMarker(entry, runId));
  const marker = entries[start];
  if (!marker) return undefined;
  const members = new Set([marker.id]);
  let leaf = marker.id;

  for (const entry of entries.slice(start + 1)) {
    if (isMarker(entry) || entry.parentId === null || !members.has(entry.parentId)) continue;
    members.add(entry.id);
    leaf = entry.id;
  }

  return leaf;
}

/** The entries from the root to a leaf. */
export function branchTo(entries: readonly SessionEntry[], leafId: string | null): SessionEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch: SessionEntry[] = [];

  for (let id = leafId; id !== null;) {
    const entry = byId.get(id);
    if (!entry || branch.length >= byId.size) throw new Error(UNAVAILABLE);
    branch.push(entry);
    id = entry.parentId;
  }

  return branch.reverse();
}

/**
 * Entries that no response answered. Pi records a changed model or thinking level when the
 * next run starts, which can follow an unanswered prompt.
 */
function unanswered(entry: SessionEntry): boolean {
  return (
    (entry.type === "message" && entry.message.role === "user") ||
    entry.type === "custom_message" ||
    entry.type === "model_change" ||
    entry.type === "thinking_level_change"
  );
}

/**
 * Where a new run continues an earlier one: its final leaf, without trailing unanswered input.
 * The walk ends at the run's marker at the latest. `interrupted` reports a call without a result
 * in the last response that did not fail. Pi runs no call of a failed or aborted response, and a
 * later response continues after an earlier interruption.
 */
export function resumePoint(
  entries: readonly SessionEntry[],
  runId: string
): { leafId: string; interrupted: boolean } | undefined {
  const leaf = runLeaf(entries, runId);
  if (leaf === undefined) return undefined;
  const branch = branchTo(entries, leaf);
  let last = branch.at(-1);

  while (last && unanswered(last)) {
    branch.pop();
    last = branch.at(-1);
  }

  if (!last) return undefined;
  const pending = new Set<string>();

  for (const item of branch) {
    if (item.type !== "message") continue;
    const { message } = item;

    if (message.role === "assistant") {
      if (message.stopReason === "error" || message.stopReason === "aborted") continue;
      pending.clear();
      for (const block of message.content) if (block.type === "toolCall") pending.add(block.id);
    } else if (message.role === "toolResult") pending.delete(message.toolCallId);
  }

  return { leafId: last.id, interrupted: pending.size > 0 };
}

/** Reject damaged complete records instead of silently building a different ancestry. */
function parseSession(buffer: Buffer) {
  // Cut at a byte boundary before decoding: an unfinished line can end inside a UTF-8 character.
  const complete = buffer.subarray(0, buffer.lastIndexOf(0x0a) + 1);
  let records: unknown[];

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(complete);
    records = text
      .split("\n")
      .filter((line) => line.trim())
      .map((line): unknown => JSON.parse(line));
  } catch {
    // Decoder and JSON errors can include stored content.
    throw new Error(UNAVAILABLE);
  }

  const [first, ...entries] = records;
  const header = headerSchema.safeParse(first).data;
  if (!header) throw new Error(UNAVAILABLE);
  const ids = new Set<string>();

  for (const value of entries) {
    const entry = entrySchema.safeParse(value).data;
    if (!entry || ids.has(entry.id) || (entry.parentId !== null && !ids.has(entry.parentId)))
      throw new Error(UNAVAILABLE);
    ids.add(entry.id);
  }

  // The tree structure is checked above. Pi owns the entry payloads; retain their full source.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { ...header, entries: entries as SessionEntry[] };
}

/**
 * Read a child session into owned memory; undefined when the file does not exist. Its writer can
 * be appending, so a partial final line is ignored. Readers never open the file for writing.
 */
async function readSession(file: string): Promise<Parsed | undefined> {
  let handle;

  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }

  try {
    const stat = await handle.stat();
    const { size, mtimeMs, ctimeMs, dev, ino } = stat;
    if (!stat.isFile() || size > SESSION_MAX_BYTES) throw new Error(UNAVAILABLE);
    const cached = cache.get(file);
    if (
      cached?.size === size &&
      cached.mtimeMs === mtimeMs &&
      cached.ctimeMs === ctimeMs &&
      cached.dev === dev &&
      cached.ino === ino
    )
      return cached;
    const buffer = Buffer.alloc(size);
    let offset = 0;

    while (offset < size) {
      const { bytesRead } = await handle.read(buffer, offset, size - offset, offset);
      if (bytesRead === 0) throw new Error(UNAVAILABLE);
      offset += bytesRead;
    }

    const parsed = { size, mtimeMs, ctimeMs, dev, ino, ...parseSession(buffer) };
    remember(file, parsed);

    return parsed;
  } finally {
    await handle.close();
  }
}

/** Check that a task's file exists and still has the task's session identity. */
export async function checkSession(task: Pick<TaskRecord, "session_file" | "session_id">) {
  const session = await readSession(task.session_file);
  if (!session) throw new Error("Subagent session file is missing");
  if (session.id !== task.session_id)
    throw new Error("Subagent session identity does not match its task");
}

/**
 * A run's ancestry in its task's child file: the entries from the root to the run's final leaf, or
 * with `beforeRun` to the parent of the run's marker. An active task's ancestry is empty while its
 * file does not exist, because Pi writes a new session file with its first response.
 */
export async function readRunAncestry(
  task: TaskRecord,
  beforeRun: boolean
): Promise<{ cwd: string; entries: SessionEntry[] }> {
  const session = await readSession(task.session_file);
  if (!session && task.state === "active") return { cwd: "", entries: [] };
  if (session && session.id !== task.session_id)
    throw new Error("Subagent session identity does not match its task");
  const leafId = session && runLeaf(session.entries, task.run_id);
  if (!session || leafId === undefined) throw new Error(UNAVAILABLE);
  const end = beforeRun
    ? (session.entries.find((entry) => isMarker(entry, task.run_id))?.parentId ?? null)
    : leafId;

  return { cwd: session.cwd, entries: branchTo(session.entries, end) };
}
