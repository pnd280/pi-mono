import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";

import { checkHandle, sameFile } from "./privacy.ts";

/** Tests use hooks around real I/O; production callers omit them. */
export type WriteHooks = {
  beforeWrite?(): Promise<void>;
  beforeRename?(): Promise<void>;
  afterRename?(): Promise<void>;
};

export type AtomicWriteWarning = "post-commit" | "close";

/**
 * Replace a file under caller-established private parents and an owned lock.
 * Check cancellation before calling; once started, allow the write to finish.
 * Rename commits the mutation: pre-commit errors throw, post-commit failures return
 * warnings. Do not retry a committed write. The parent directory is not fsynced,
 * so process-crash atomicity does not guarantee power-loss durability.
 */
export async function atomicReplace(
  path: string,
  content: string,
  hooks: WriteHooks = {}
): Promise<AtomicWriteWarning[]> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600
  );
  let committed = false;
  const warnings: AtomicWriteWarning[] = [];

  try {
    await checkHandle(handle);
    await hooks.beforeWrite?.();
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await hooks.beforeRename?.();
    await rename(temporary, path);
    committed = true;
    await hooks.afterRename?.();
  } catch (error) {
    if (!committed) throw error;
    warnings.push("post-commit");
  } finally {
    if (!committed) {
      try {
        if (await sameFile(temporary, handle)) await unlink(temporary);
      } catch {
        // The prior destination is intact. Only our temporary file may remain.
      }
    }

    try {
      await handle.close();
    } catch {
      if (committed) warnings.push("close");
    }
  }

  return warnings;
}
