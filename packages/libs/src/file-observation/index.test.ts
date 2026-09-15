import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { observeTextFile } from "./index.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "file-observation-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("returns complete source, preserving BOMs and replacement characters without permission repair", async () => {
  const path = join(directory, "source");
  const text = "\uFEFFexact\t\r\n界😀\uFFFD\0";
  await writeFile(path, text, { mode: 0o640 });
  const before = await stat(path);
  expect(await observeTextFile(path, Buffer.byteLength(text))).toEqual({ status: "ready", text });
  expect((await stat(path)).mode).toBe(before.mode);
  expect(await readFile(path, "utf8")).toBe(text);
  expect(await observeTextFile(path, Buffer.byteLength(text) - 1)).toEqual({ status: "too-large" });
  const alias = join(directory, "alias");
  await symlink(path, alias);
  expect(await observeTextFile(alias, 100)).toEqual({ status: "ready", text });
});

it("distinguishes empty, missing, invalid UTF-8, and nonregular files without clipped decoding", async () => {
  const path = join(directory, "source");
  expect(await observeTextFile(path, 1)).toEqual({ status: "missing" });
  await writeFile(path, "");
  expect(await observeTextFile(path, 0)).toEqual({ status: "ready", text: "" });
  await writeFile(path, Buffer.from([0xff]));
  expect(await observeTextFile(path, 1)).toEqual({ status: "invalid-utf8" });
  expect(await observeTextFile(directory, 1)).toEqual({ status: "not-file" });
  await expect(observeTextFile(path, -1)).rejects.toThrow(RangeError);
});

it.skipIf(process.platform === "win32")("refuses a FIFO without waiting for a writer", async () => {
  const path = join(directory, "pipe");
  execFileSync("mkfifo", [path]);
  expect(await observeTextFile(path, 100)).toEqual({ status: "not-file" });
});
