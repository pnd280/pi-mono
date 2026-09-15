import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { workspace } from "../test-fixture.ts";
import { acquireLock } from "./lock.ts";

it.each(["token", "inode"] as const)(
  "never removes a lock whose %s ownership changed",
  async (changed) => {
    const fixture = await workspace();
    const path = join(fixture.storage, "drafts.json.lock");

    try {
      const lock = await acquireLock(path, new AbortController().signal);
      let token = await readFile(path, "utf8");

      if (changed === "inode") await unlink(path);
      else token = "another owner's token";
      await writeFile(path, token, { mode: 0o600 });
      await expect(lock.release()).rejects.toThrow("ownership changed");
      expect(await readFile(path, "utf8")).toBe(token);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  }
);
