import { createHash, randomUUID } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";

import {
  CURRENT_SESSION_VERSION,
  getAgentDir,
  SessionManager,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import {
  acquireLock,
  atomicReplace,
  boundedRead,
  privateDirectory
} from "@pi-mono/libs/private-files";
import {
  parseTranscriptRecord,
  TRANSCRIPT_TYPE,
  type TranscriptSnapshot
} from "pi-tool-display/viewer";
import { z } from "zod";

import { CHECKPOINT_MAX_BYTES } from "./constants.ts";
import type { TaskRecord } from "./records.ts";

export const checkpointReference = z.object({
  version: z.literal(1),
  id: z.uuid(),
  file: z.string().refine(isAbsolute),
  digest: z.string().regex(/^[0-9a-f]{64}$/)
});

const entry = z.object({
  type: z.string(),
  id: z.string().min(1),
  parentId: z.string().nullable(),
  timestamp: z.string()
});
const checkpointSchema = z.object({
  version: z.literal(1),
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  entries: z.array(z.custom<SessionEntry>((value) => entry.safeParse(value).success)),
  leafId: z.string().nullable()
});

type Checkpoint = z.infer<typeof checkpointSchema>;

async function directory(): Promise<string> {
  const root = join(getAgentDir(), "pi-subagents");
  await privateDirectory(root);
  const path = join(root, "checkpoints");
  await privateDirectory(path);

  return path;
}

/** Unique files are never replaced after publication and are not automatically deleted. */
async function write(
  content: string,
  suffix: string,
  signal: AbortSignal,
  warn?: (message: string) => void
): Promise<string> {
  if (Buffer.byteLength(content) > CHECKPOINT_MAX_BYTES)
    throw new Error("Subagent checkpoint exceeds the storage limit");

  try {
    const path = join(await directory(), `${randomUUID()}${suffix}`);
    const lock = await acquireLock(`${path}.lock`, { signal, timeoutMs: 5000 });

    try {
      signal.throwIfAborted();
      const warnings = await atomicReplace(path, content);
      if (warnings.length) warn?.("Subagent checkpoint saved with a cleanup warning");
    } finally {
      try {
        await lock.release();
      } catch {
        warn?.("Subagent checkpoint lock cleanup failed");
      }
    }

    return path;
  } catch {
    signal.throwIfAborted();
    throw new Error("Subagent checkpoint could not be saved");
  }
}

export function checkpointSession(snapshot: TranscriptSnapshot): SessionManager {
  const manager = SessionManager.inMemory(snapshot.cwd, undefined, [
    {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: snapshot.sessionId,
      cwd: snapshot.cwd,
      timestamp: new Date(0).toISOString()
    },
    ...structuredClone(snapshot.entries)
  ]);

  if (snapshot.leafId === null) manager.resetLeaf();
  else {
    if (!manager.getEntry(snapshot.leafId))
      throw new Error("Subagent checkpoint leaf is unavailable");
    manager.branch(snapshot.leafId);
  }

  return manager;
}

export async function saveCheckpoint(
  taskId: string,
  snapshot: TranscriptSnapshot,
  signal: AbortSignal,
  warn?: (message: string) => void
): Promise<z.infer<typeof checkpointReference>> {
  const data: Checkpoint = { version: 1, taskId, ...snapshot, entries: [...snapshot.entries] };
  const content = JSON.stringify(checkpointSchema.parse(data));
  const path = await write(content, ".json", signal, warn);

  return {
    version: 1,
    id: basename(path, ".json"),
    file: path,
    digest: createHash("sha256").update(content).digest("hex")
  };
}

export async function readCheckpoint(task: TaskRecord): Promise<Checkpoint> {
  try {
    const reference = checkpointReference.parse(task.checkpoint);
    if (basename(reference.file) !== `${reference.id}.json`)
      throw new Error("Checkpoint reference mismatch");
    const raw = await boundedRead(reference.file, CHECKPOINT_MAX_BYTES);
    if (!raw || createHash("sha256").update(raw).digest("hex") !== reference.digest)
      throw new Error("Missing or changed checkpoint");
    const saved = checkpointSchema.parse(JSON.parse(raw.toString("utf8")));
    if (saved.taskId !== task.task_id || saved.sessionId !== task.session_id)
      throw new Error("Checkpoint identity mismatch");
    checkpointSession(saved);

    return saved;
  } catch {
    throw new Error("Subagent checkpoint history is unavailable");
  }
}

/** Materialise only captured data in a new owned session; never open the source for writing. */
export async function restoreCheckpoint(
  task: TaskRecord,
  signal: AbortSignal,
  warn?: (message: string) => void
) {
  const saved = await readCheckpoint(task);
  const manager = checkpointSession(saved);
  const sessionId = randomUUID();
  const entries = manager.getBranch().map((item) => {
    if (item.type !== "custom" || item.customType !== TRANSCRIPT_TYPE) return item;
    const record = parseTranscriptRecord(item.data);

    return record?.sessionId === saved.sessionId
      ? { ...item, data: { ...record, sessionId } }
      : item;
  });
  const pending = new Set<string>();

  for (const item of entries) {
    if (item.type !== "message") continue;
    if (item.message.role === "assistant") {
      for (const block of item.message.content)
        if (block.type === "toolCall") pending.add(block.id);
    } else if (item.message.role === "toolResult") pending.delete(item.message.toolCallId);
  }

  const header = {
    type: "session",
    version: CURRENT_SESSION_VERSION,
    id: sessionId,
    cwd: saved.cwd,
    timestamp: new Date().toISOString(),
    parentSession: task.session_file
  };
  const sessionFile = await write(
    [header, ...entries].map((item) => JSON.stringify(item)).join("\n") + "\n",
    ".jsonl",
    signal,
    warn
  );

  return { sessionId, sessionFile, entries, interrupted: pending.size > 0 };
}
