import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vite-plus/test";

import { atomicReplace } from "./atomic.ts";

it.runIf(process.platform === "linux")(
  "restricts inherited POSIX ACL access on atomic replacement",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "atomic-replace-acl-test-"));
    const path = join(directory, "notes");
    const unrelatedUid = (process.getuid?.() ?? 1000) + 1;

    try {
      await writeFile(path, "original", { mode: 0o600 });
      await promisify(execFile)("setfacl", ["-m", `d:u:${unrelatedUid}:rwx`, directory]);

      await atomicReplace(path, "replacement");
      const inherited = await promisify(execFile)("getfacl", ["-cpn", path]);
      expect(inherited.stdout).toContain(`user:${unrelatedUid}:rwx`);
      expect(inherited.stdout).toContain("mask::---");
      expect(await readFile(path, "utf8")).toBe("replacement");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

// This test checks POSIX modes, which native Windows does not have.
it.runIf(process.platform !== "win32")(
  "preserves bytes before rename and commits exact text privately",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "atomic-replace-test-"));
    const path = join(directory, "notes");

    const beforeCommit = async () => {
      expect(await readFile(path, "utf8")).toBe("original");
      throw new Error("injected fault");
    };

    try {
      await writeFile(path, "original");

      for (const hooks of [{ beforeWrite: beforeCommit }, { beforeRename: beforeCommit }]) {
        await expect(atomicReplace(path, "uncommitted", hooks)).rejects.toThrow("injected");
        expect(await readFile(path, "utf8")).toBe("original");
        expect(await readdir(directory)).toEqual(["notes"]);
      }

      const text = " \r\n界😀\0tail\n";
      await atomicReplace(path, text);
      expect(await readFile(path, "utf8")).toBe(text);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(await readdir(directory)).toEqual(["notes"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
