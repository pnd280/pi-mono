import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vite-plus/test";

import { recordedAt, session, workspace } from "../test-fixture.ts";

it.runIf(process.platform === "linux")(
  "refuses FIFO reads without hanging or changing unrelated files",
  async () => {
    const fixture = await workspace();

    try {
      await promisify(execFile)("mkfifo", [join(fixture.storage, "history.json")]);
      expect((await fixture.repository.read("history")).status).toBe("unavailable");
      expect((await fixture.repository.read("drafts")).status).toBe("ready");
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform === "linux")(
  "establishes private effective POSIX ACL masks including inherited ACLs",
  async () => {
    const fixture = await workspace();

    try {
      const path = join(fixture.storage, "drafts.json");
      await writeFile(path, JSON.stringify({ version: 1, cwd: fixture.realCwd, entries: [] }), {
        mode: 0o600
      });
      const unrelatedUid = (process.getuid?.() ?? 1000) + 1;
      await promisify(execFile)("setfacl", ["-m", `u:${unrelatedUid}:rw`, path]);
      await promisify(execFile)("setfacl", ["-m", `d:u:${unrelatedUid}:rwx`, fixture.storage]);
      const before = await readFile(path);
      expect((await fixture.repository.read("drafts")).status).toBe("ready");
      const repaired = await promisify(execFile)("getfacl", ["-cp", path]);
      expect(repaired.stdout).toContain("mask::---");
      expect(await readFile(path)).toEqual(before);
      expect(
        (
          await fixture.repository.mutate(
            "drafts",
            { kind: "add", text: "private", recordedAt },
            session()
          )
        ).status
      ).toBe("committed");
      const replaced = await promisify(execFile)("getfacl", ["-cp", path]);
      expect(replaced.stdout).toContain("mask::---");
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  }
);
