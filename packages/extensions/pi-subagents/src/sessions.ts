import { readFile } from "node:fs/promises";

import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { checkpointSession, readCheckpoint } from "./checkpoints.ts";
import { rebuildOwnership, type TaskRecord } from "./records.ts";

const headerSchema = z.object({
  type: z.literal("session"),
  id: z.string().min(1),
  cwd: z.string().min(1)
});

/** Foreign files are decoded into owned memory: SessionManager.open may rewrite them. */
export async function readTaskSession(task: TaskRecord): Promise<SessionManager | undefined> {
  const contents = await readFile(task.session_file, "utf8");
  const lines = contents.split("\n").filter((line) => line.trim());

  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch {
      if (index === lines.length - 1 && !contents.endsWith("\n")) return;
      throw new Error("Subagent session file is malformed");
    }
  }

  const entries = parseSessionEntries(contents);
  const header = headerSchema.safeParse(entries[0]).data;
  if (!header || header.id !== task.session_id)
    throw new Error("Subagent session identity does not match its task");

  return SessionManager.inMemory(header.cwd, undefined, entries);
}

/** Recover direct ownership at each level; unavailable descendants never expand the owned tree. */
export async function descendantRecords(
  roots: readonly TaskRecord[],
  recipientSessionId: string,
  transferred: Iterable<string>
): Promise<TaskRecord[]> {
  const known = new Map(roots.map((task) => [task.task_id, task]));
  const seen = new Set([...known.keys(), ...transferred]);
  const found: TaskRecord[] = [];
  const pending = [...roots];

  for (let index = 0; index < pending.length; index++) {
    const task = pending[index];
    if (!task) continue;
    let session: SessionManager | undefined;

    try {
      session = checkpointSession(await readCheckpoint(task));
    } catch {
      continue;
    }

    const { tasks, transfers } = rebuildOwnership(session.getBranch());
    const ancestors = new Set([recipientSessionId]);
    let ancestor: TaskRecord | undefined = task;

    while (ancestor && !ancestors.has(ancestor.task_id)) {
      ancestors.add(ancestor.task_id);
      ancestor = ancestor.parent_task_id === null ? undefined : known.get(ancestor.parent_task_id);
    }

    const children = [
      ...[...tasks.values()].filter((child) => child.parent_task_id === task.task_id),
      // The former owner's receipt is the commit point, including when the receiving
      // session append failed. Its recipient and that recipient's ancestors recover
      // the same parent identity; an outgoing transfer suppresses older receipts.
      ...[...transfers.values()].filter((transfer) => ancestors.has(transfer.recipient_session_id))
    ];

    for (const child of children) {
      if (seen.has(child.task_id)) continue;
      seen.add(child.task_id);
      known.set(child.task_id, child);
      found.push(child);
      pending.push(child);
    }
  }

  return found;
}
