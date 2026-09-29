import { execFile } from "node:child_process";
import {
  chmod,
  link,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { PrivateFileError, ReadLimitError } from "./errors.ts";
import { boundedRead, checkHandle } from "./privacy.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "private-files-test-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it("honors caller byte limits, including empty and missing files, and preserves exact bytes", async () => {
  const path = join(directory, "data");
  expect(await boundedRead(path, 0)).toBeUndefined();
  await writeFile(path, "");
  expect(await boundedRead(path, 0)).toEqual(Buffer.alloc(0));
  const bytes = Buffer.from(" \r\n界😀\0");
  await writeFile(path, bytes);
  expect(await boundedRead(path, bytes.length)).toEqual(bytes);
  await expect(boundedRead(path, bytes.length - 1)).rejects.toBeInstanceOf(ReadLimitError);
  expect(await readFile(path)).toEqual(bytes);
  for (const limit of [-1, NaN, Infinity, 1.5])
    await expect(boundedRead(path, limit)).rejects.toBeInstanceOf(RangeError);
});

it("refuses a final-file symlink without changing the target", async () => {
  const path = join(directory, "data");
  const target = join(directory, "unrelated");
  const bytes = Buffer.from("unrelated symlink target\0");
  await writeFile(target, bytes);
  await chmod(target, 0o640);
  await symlink(target, path);

  await expect(boundedRead(path, bytes.length)).rejects.toBeInstanceOf(PrivateFileError);
  expect(await readFile(target)).toEqual(bytes);
  expect((await stat(target)).mode & 0o777).toBe(0o640);
});

it("refuses a hard link without changing the shared source", async () => {
  const path = join(directory, "data");
  const source = join(directory, "unrelated");
  const bytes = Buffer.from("unrelated hard-link source\0");
  await writeFile(source, bytes);
  await chmod(source, 0o640);
  await link(source, path);

  await expect(boundedRead(path, bytes.length)).rejects.toBeInstanceOf(PrivateFileError);
  const handle = await open(path, "r");

  try {
    await expect(checkHandle(handle)).rejects.toBeInstanceOf(PrivateFileError);
  } finally {
    await handle.close();
  }

  expect(await readFile(source)).toEqual(bytes);
  expect((await stat(source)).mode & 0o777).toBe(0o640);
});

it.runIf(process.platform === "linux")("refuses a FIFO", async () => {
  const path = join(directory, "data");
  await promisify(execFile)("mkfifo", [path]);

  await expect(boundedRead(path, 16)).rejects.toBeInstanceOf(PrivateFileError);
});

it.runIf(process.platform === "linux")(
  "repairs effective POSIX ACL access without changing file bytes",
  async () => {
    const path = join(directory, "data");
    const bytes = Buffer.from("private ACL contents\0");
    const unrelatedUid = (process.getuid?.() ?? 1000) + 1;
    await writeFile(path, bytes, { mode: 0o600 });
    await promisify(execFile)("setfacl", ["-m", `u:${unrelatedUid}:rw`, path]);
    const exposed = await promisify(execFile)("getfacl", ["-cpn", path]);
    expect(exposed.stdout).toContain(`user:${unrelatedUid}:rw-`);
    expect(exposed.stdout).toContain("mask::rw-");

    expect(await boundedRead(path, bytes.length)).toEqual(bytes);
    const repaired = await promisify(execFile)("getfacl", ["-cpn", path]);
    expect(repaired.stdout).toContain(`user:${unrelatedUid}:rw-`);
    expect(repaired.stdout).toContain("mask::---");
    expect(await readFile(path)).toEqual(bytes);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  }
);

it("checks descriptor ownership before permission repair", async () => {
  const path = join(directory, "owner-check");
  await writeFile(path, "untouched", { mode: 0o644 });
  const handle = await open(path, "r");

  try {
    const uid = (await handle.stat()).uid;
    vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
    await expect(checkHandle(handle)).rejects.toThrow("ownership");
    expect((await handle.stat()).mode & 0o777).toBe(0o644);
  } finally {
    await handle.close();
  }
});
