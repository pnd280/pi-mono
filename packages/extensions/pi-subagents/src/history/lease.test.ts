import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vite-plus/test";

import { WriterLease } from "./lease.ts";

vi.mock("node:fs/promises", { spy: true });

const directories: string[] = [];

afterEach(async () => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

test("a release that cannot remove its entry blocks no later acquire in the same process", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "pi-subagents-lease-"));
  directories.push(directory);
  const file = join(directory, "child.jsonl");
  const leases = `${file}.lease`;
  const first = await WriterLease.acquire(file, [process.pid]);
  // Windows refuses the removal while another process, such as a virus scanner, has it open.
  vi.mocked(fs.unlink).mockRejectedValueOnce(
    Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })
  );
  await expect(first.release()).rejects.toThrow("EPERM");
  // The entry that remains names this live process.
  expect(await fs.readdir(leases)).toHaveLength(1);

  const second = await WriterLease.acquire(file, [process.pid]);
  expect(await fs.readdir(leases)).toHaveLength(1);
  // A lease that this process holds still excludes another writer.
  await expect(WriterLease.acquire(file, [process.pid])).rejects.toThrow(
    "Task is running in another process"
  );
  await second.release();
  await expect(fs.readdir(leases)).rejects.toThrow("ENOENT");
});
