import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, test } from "vite-plus/test";

import { readLogTail } from "./log.ts";

const exec = promisify(execFile);
const posix = test.skipIf(process.platform === "win32");
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

/** A directory with a regular log file and another regular file. */
async function logs(): Promise<{ directory: string; log: string; other: string }> {
  const directory = await fs.mkdtemp(join(tmpdir(), "pi-subagents-log-"));
  directories.push(directory);
  const log = join(directory, "job.log");
  const other = join(directory, "other.log");
  await fs.writeFile(log, "Job output\n");
  await fs.writeFile(other, "Other output\n");

  return { directory, log, other };
}

posix("refuses a symbolic link to a regular file", async () => {
  const { log, other } = await logs();
  await fs.rm(log);
  await fs.symlink(other, log);

  await expect(readLogTail(log)).rejects.toThrow("Job log is not a regular file");
});

posix("refuses a FIFO without blocking", async () => {
  const { log } = await logs();
  await fs.rm(log);
  await exec("mkfifo", [log], { timeout: STEP_TIMEOUT_MS });

  await expect(readLogTail(log)).rejects.toThrow("Job log is not a regular file");
});

/** What the test renames over the log path after the reader's `lstat`, and how the read fails. */
const replacements = [
  { kind: "regular file", error: { message: "Job log changed while it was opened" } },
  // The link leads to the file that `lstat` checked, so only the no-follow open refuses it.
  { kind: "symbolic link to the checked file", error: { code: "ELOOP" } },
  // Without a writer, only the nonblocking open returns.
  { kind: "FIFO", error: { message: "Job log changed while it was opened" } }
];

test.for(replacements)(
  "refuses a $kind that replaced the log path after the reader checked it",
  async ({ kind, error }, context) => {
    context.skip(kind !== "regular file" && process.platform === "win32", "Needs POSIX");
    const { directory, log, other } = await logs();
    if (kind !== "regular file") await fs.rm(other);
    if (kind === "FIFO") await exec("mkfifo", [other], { timeout: STEP_TIMEOUT_MS });

    if (kind === "symbolic link to the checked file") {
      const checked = join(directory, "checked.log");
      await fs.link(log, checked);
      await fs.symlink(checked, other);
    }

    // A blocking open must be killable without leaving a Vitest worker stuck.
    await exec(
      process.execPath,
      [
        "--experimental-transform-types",
        "--input-type=module",
        "-e",
        `import assert from "node:assert/strict";
     import { syncBuiltinESMExports } from "node:module";
     const { readLogTail } = await import(${JSON.stringify(new URL("./log.ts", import.meta.url).href)});
     const promises = process.getBuiltinModule("node:fs/promises");
     const { lstat, rename } = promises;
     promises.lstat = async (...args) => {
       promises.lstat = lstat;
       syncBuiltinESMExports();
       const entry = await lstat(...args);
       await rename(${JSON.stringify(other)}, ${JSON.stringify(log)});
       return entry;
     };
     syncBuiltinESMExports();
     await assert.rejects(readLogTail(${JSON.stringify(log)}), ${JSON.stringify(error)});`
      ],
      { timeout: STEP_TIMEOUT_MS, killSignal: "SIGKILL" }
    );

    // Without a change, the reader accepts the same file.
    if (kind === "regular file") expect(await readLogTail(log)).toBe("Other output\n");
  }
);
