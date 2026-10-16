import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vite-plus/test";

import { readLogTail } from "./log.ts";

vi.mock("node:fs/promises", { spy: true });

const posix = test.skipIf(process.platform === "win32");
const directories: string[] = [];

afterEach(async () => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

/** A directory with a regular log file and another regular file. */
async function logs(): Promise<{ log: string; other: string }> {
  const directory = await fs.mkdtemp(join(tmpdir(), "pi-subagents-log-"));
  directories.push(directory);
  const log = join(directory, "job.log");
  const other = join(directory, "other.log");
  await fs.writeFile(log, "Job output\n");
  await fs.writeFile(other, "Other output\n");

  return { log, other };
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
  execFileSync("mkfifo", [log]);

  await expect(readLogTail(log)).rejects.toThrow("Job log is not a regular file");
});

test("refuses a file that replaced the log path after the reader checked it", async () => {
  const { log, other } = await logs();
  const { open } = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
    await fs.rename(other, log);

    return open(...args);
  });

  await expect(readLogTail(log)).rejects.toThrow("Job log changed while it was opened");
  // Without a change, the reader accepts the same file.
  expect(await readLogTail(log)).toBe("Other output\n");
});
