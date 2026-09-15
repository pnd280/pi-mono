import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { ReadLimitError } from "./errors.ts";
import { boundedRead, checkHandle, privateDirectory } from "./privacy.ts";

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

it("creates private caller-named directories without feature-specific paths", async () => {
  const path = join(directory, "notes");
  await privateDirectory(path);
  await privateDirectory(path);
  expect((await stat(path)).mode & 0o777).toBe(0o700);
});
