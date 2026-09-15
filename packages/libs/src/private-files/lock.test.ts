import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { LockTimeoutError } from "./errors.ts";
import { acquireLock } from "./lock.ts";

it.each(["token", "inode"] as const)(
  "never removes a lock whose %s ownership changed",
  async (changed) => {
    const directory = await mkdtemp(join(tmpdir(), "owned-lock-test-"));
    const path = join(directory, "data.lock");

    try {
      const lock = await acquireLock(path, {
        signal: new AbortController().signal,
        timeoutMs: 2000
      });
      let token = await readFile(path, "utf8");

      if (changed === "inode") await unlink(path);
      else token = "another owner's token";
      await writeFile(path, token, { mode: 0o600 });
      await expect(lock.release()).rejects.toThrow("ownership changed");
      expect(await readFile(path, "utf8")).toBe(token);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it("uses the caller deadline without stealing locks and cancels waits without leaving artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "owned-lock-timeout-"));
  const path = join(directory, "data.lock");
  const controller = new AbortController();
  const lock = await acquireLock(path, { signal: controller.signal, timeoutMs: 0 });

  try {
    const token = await readFile(path, "utf8");
    await expect(
      acquireLock(path, { signal: controller.signal, timeoutMs: 0 })
    ).rejects.toBeInstanceOf(LockTimeoutError);
    const pending = acquireLock(path, { signal: controller.signal, timeoutMs: 10000 });
    const cancelled = expect(pending).rejects.toThrow();
    controller.abort();
    await cancelled;
    expect(await readFile(path, "utf8")).toBe(token);
  } finally {
    await lock.release();
    await rm(directory, { recursive: true, force: true });
  }
});
