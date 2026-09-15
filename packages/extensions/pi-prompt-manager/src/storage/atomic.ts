import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";

import { checkHandle, sameFile } from "./privacy.ts";

/** Fault seams surround real I/O; production uses no hooks. */
export type WriteHooks = {
  beforeWrite?(): Promise<void>;
  beforeRename?(): Promise<void>;
  afterRename?(): Promise<void>;
};

export async function atomicReplace(
  path: string,
  content: string,
  hooks: WriteHooks = {}
): Promise<string[]> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600
  );
  let committed = false;
  const warnings: string[] = [];

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
    warnings.push("Collection committed, but post-commit cleanup failed.");
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
      if (committed)
        warnings.push("Collection committed, but closing its temporary descriptor failed.");
    }
  }

  return warnings;
}
