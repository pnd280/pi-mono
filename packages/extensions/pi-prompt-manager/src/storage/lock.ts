import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink, type FileHandle } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { PromptError } from "../model.ts";
import { checkHandle, hasCode, privateOpen, sameFile } from "./privacy.ts";

export type OwnedLock = { release(): Promise<void> };

async function release(path: string, handle: FileHandle, token: string): Promise<void> {
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

    if (!(await sameFile(path, handle)) || buffer.subarray(0, bytesRead).toString() !== token)
      throw new PromptError("Lock ownership changed; it was not removed.");
    await unlink(path);
  } finally {
    await handle.close();
  }
}

/** Never reclaim an existing lock, regardless of age or process liveness. */
export async function acquireLock(path: string, signal: AbortSignal): Promise<OwnedLock> {
  const deadline = performance.now() + 2000;

  for (;;) {
    signal.throwIfAborted();
    let handle: FileHandle;

    try {
      handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
        0o600
      );
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;

      // Refuse unsafe artifacts without reading a competing owner's contents.
      try {
        const existing = await privateOpen(path);
        await existing.close();
      } catch (inspectionError) {
        if (!hasCode(inspectionError, "ENOENT")) throw inspectionError;
      }

      if (performance.now() >= deadline)
        throw new PromptError(
          "Collection is busy (two-second lock deadline). Abandoned locks require manual removal with all participating sessions stopped."
        );
      await delay(Math.min(25, Math.max(1, deadline - performance.now())), undefined, { signal });
      continue;
    }

    const token = randomUUID();

    try {
      await checkHandle(handle);
      await handle.writeFile(token);
    } catch (error) {
      try {
        if (await sameFile(path, handle)) await unlink(path);
      } finally {
        await handle.close();
      }

      throw error;
    }

    return { release: () => release(path, handle, token) };
  }
}
