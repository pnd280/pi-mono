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

      expect(await atomicReplace(path, "replacement")).toEqual([]);
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

it("preserves bytes before rename, commits exact text privately, and distinguishes cleanup warnings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atomic-replace-test-"));
  const path = join(directory, "notes");

  const fault = async () => {
    throw new Error("injected fault");
  };

  try {
    await writeFile(path, "original");

    for (const hooks of [{ beforeWrite: fault }, { beforeRename: fault }]) {
      await expect(atomicReplace(path, "uncommitted", hooks)).rejects.toThrow("injected");
      expect(await readFile(path, "utf8")).toBe("original");
      expect(await readdir(directory)).toEqual(["notes"]);
    }

    const text = " \r\n界😀\0tail\n";
    expect(await atomicReplace(path, text, { afterRename: fault })).toEqual(["post-commit"]);
    expect(await readFile(path, "utf8")).toBe(text);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await atomicReplace(path, "next")).toEqual([]);
    expect(await readFile(path, "utf8")).toBe("next");
    expect(await readdir(directory)).toEqual(["notes"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
