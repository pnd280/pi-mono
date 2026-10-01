import { constants } from "node:fs";
import { mkdtemp, open, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vite-plus/test";

import { LockTimeoutError, PrivateFileError } from "./errors.ts";
import { acquireLock } from "./lock.ts";

vi.mock("node:fs/promises", { spy: true });
afterEach(() => vi.resetAllMocks());

it("acquires a lock released while its existing descriptor is being inspected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "owned-lock-turnover-"));
  const path = join(directory, "data.lock");
  const options = { signal: new AbortController().signal, timeoutMs: 2000 };
  const owner = { lock: await acquireLock(path, options), released: false };
  const originalToken = await readFile(path, "utf8");
  const { open: realOpen } = await vi.importActual<{ open: typeof open }>("node:fs/promises");
  vi.mocked(open).mockImplementation(async (...args) => {
    const handle = await realOpen(...args);

    if (args[0] === path && typeof args[1] === "number" && !(args[1] & constants.O_CREAT)) {
      // Reproduce release after open but before the waiter's descriptor checks.
      await owner.lock.release();
      owner.released = true;
    }

    return handle;
  });

  try {
    const next = await acquireLock(path, options);

    try {
      expect(owner.released).toBe(true);
      expect(await readFile(path, "utf8")).not.toBe(originalToken);
    } finally {
      await next.release();
    }

    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    if (!owner.released) await owner.lock.release();
    await rm(directory, { recursive: true, force: true });
  }
});

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
      await expect(lock.release()).rejects.toBeInstanceOf(PrivateFileError);
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
