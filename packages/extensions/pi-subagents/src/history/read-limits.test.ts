import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { createValidationWorkspace, STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test } from "vite-plus/test";

const exec = promisify(execFile);
const cases = [
  { reader: "history", kind: "FIFO" },
  { reader: "lease", kind: "FIFO" },
  { reader: "history", kind: "oversized file" },
  { reader: "lease", kind: "oversized file" }
];

test.for(cases)("$reader rejects the $kind without blocking", async ({ reader, kind }, context) => {
  context.skip(kind === "FIFO" && process.platform === "win32", "FIFOs require POSIX");
  const directory = await createValidationWorkspace("pi-subagents-read-limits-");
  context.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "work", "child.jsonl");
  const leases = `${file}.lease`;
  const path = reader === "history" ? file : join(leases, "holder");
  if (reader === "lease") await mkdir(leases);

  if (kind === "FIFO") await exec("mkfifo", [path], { timeout: STEP_TIMEOUT_MS });
  else if (reader === "history") {
    await writeFile(path, '{"type":"session","id":"recorded","cwd":"/fixture"}\n');
    // Sparse padding is an unfinished final line, so parsing alone cannot reject the size.
    await truncate(path, 64 * 1024 * 1024 + 1);
  } else {
    // Without the byte limit this is a valid, stale PID, despite its leading zeroes.
    await writeFile(path, "2147483647".padStart(1025, "0"));
  }

  const before = await lstat(path);
  const module = new URL(reader === "history" ? "./sessions.ts" : "./lease.ts", import.meta.url);
  const operation =
    reader === "history"
      ? `() => api.checkSession({ session_file: file, session_id: "recorded" })`
      : `() => api.WriterLease.acquire(file, [process.pid])`;
  const error =
    reader === "history"
      ? "Subagent session history is unavailable"
      : "Task is running in another process";

  // A blocking FIFO open must be killable without leaving a Vitest filesystem worker stuck.
  await exec(
    process.execPath,
    [
      "--experimental-transform-types",
      "--input-type=module",
      "-e",
      `import assert from "node:assert/strict";
     import * as api from ${JSON.stringify(module.href)};
     const file = ${JSON.stringify(file)};
     await assert.rejects(${operation}, { message: ${JSON.stringify(error)} });`
    ],
    { timeout: STEP_TIMEOUT_MS, killSignal: "SIGKILL" }
  );

  const after = await lstat(path);
  expect(after.ino).toBe(before.ino);
  expect(after.size).toBe(before.size);
  expect(after.isFIFO()).toBe(kind === "FIFO");

  if (reader === "lease") {
    expect(await readdir(leases)).toEqual(["holder"]);
    if (kind !== "FIFO")
      expect(await readFile(path, "utf8")).toBe("2147483647".padStart(1025, "0"));
  }
});
