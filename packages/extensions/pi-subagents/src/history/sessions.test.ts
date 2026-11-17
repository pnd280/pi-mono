import { readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { expect, test } from "vite-plus/test";

import { MARKER_ENTRY } from "../constants.ts";
import { checkSession } from "./sessions.ts";

const header = { type: "session", version: 3, id: "recorded", cwd: "/fixture" };
const marker = {
  type: "custom",
  id: "marker",
  parentId: null,
  customType: MARKER_ENTRY,
  data: { run_id: "run" }
};
const valid = `${JSON.stringify(header)}\n${JSON.stringify(marker)}\n`;

const cases = [
  {
    name: "invalid UTF-8 in a complete record",
    bytes: Buffer.concat([
      Buffer.from(`${valid}{"type":"custom","id":"bad","parentId":"marker","data":"`),
      Buffer.from([0xff]),
      Buffer.from('"}\n')
    ])
  },
  { name: "invalid JSON in a complete record", bytes: Buffer.from(`${valid}{"type":\n`) },
  { name: "duplicate entry IDs", bytes: Buffer.from(`${valid}${JSON.stringify(marker)}\n`) },
  {
    name: "a broken parent link",
    bytes: Buffer.from(
      `${valid}${JSON.stringify({ ...marker, id: "orphan", parentId: "missing" })}\n`
    )
  },
  {
    name: "a replaced inode with the cached size and modification time",
    bytes: Buffer.from(valid.replace('"recorded"', '"replaced"')),
    replace: true
  },
  {
    name: "changed bytes on the cached inode with the cached size and modification time",
    bytes: Buffer.from(valid.replace('"recorded"', '"replaced"')),
    replace: false
  }
];

test.for(cases)(
  "rejects $name without changing the child file",
  async ({ bytes, replace }, context) => {
    const directory = await createValidationWorkspace("pi-subagents-history-");
    context.onTestFinished(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, "work", "child.jsonl");
    const task = { task_id: "task", session_file: file, session_id: "recorded" };
    const timestamp = 1_700_000_000;
    await writeFile(file, valid);
    await utimes(file, timestamp, timestamp);
    await expect(checkSession(task, header.cwd)).resolves.toBeUndefined();
    expect(await readFile(file)).toEqual(Buffer.from(valid));
    const before = await stat(file);

    if (replace) {
      const replacement = join(directory, "work", "replacement.jsonl");
      await writeFile(replacement, bytes);
      await rename(replacement, file);
    } else await writeFile(file, bytes);
    await utimes(file, timestamp, timestamp);

    if (replace !== undefined) {
      const after = await stat(file);
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(after.ctimeMs).not.toBe(before.ctimeMs);
      if (replace) expect(after.ino).not.toBe(before.ino);
      else expect(after.ino).toBe(before.ino);
    }

    await expect(checkSession(task, header.cwd)).rejects.toThrow(
      replace === undefined
        ? "Subagent session history is unavailable"
        : "Subagent session identity does not match its task"
    );
    expect(await readFile(file)).toEqual(bytes);
  }
);

test("reads a file whose unfinished final record ends inside a UTF-8 character without changing it", async (context) => {
  const directory = await createValidationWorkspace("pi-subagents-history-");
  context.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "work", "child.jsonl");
  // The writer has appended the first byte of "é" and not the record's newline.
  const bytes = Buffer.concat([
    Buffer.from(`${valid}{"type":"custom","id":"partial","parentId":"marker","data":"`),
    Buffer.from([0xc3])
  ]);
  await writeFile(file, bytes);

  await expect(
    checkSession({ task_id: "task", session_file: file, session_id: "recorded" }, header.cwd)
  ).resolves.toBeUndefined();
  expect(await readFile(file)).toEqual(bytes);
});
