import {
  appendFile,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { observeTextFile } from "./source.ts";

vi.mock("node:fs/promises", { spy: true });

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tool-display-source-"));
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
});

it.each([
  { case: "grows", change: (path: string) => appendFile(path, "-") },
  { case: "changes only its mtime", change: (path: string) => utimes(path, 0, 0) }
])("refuses a source that $case during the read", async ({ change }) => {
  const path = join(directory, "source");
  await writeFile(path, "before\n");
  vi.mocked(open).mockImplementationOnce(async (file, flags) => {
    const handle = await open(file, flags);
    const initial = await handle.stat();
    // The file changes after its first stat, as a concurrent writer would.
    vi.spyOn(handle, "stat").mockImplementationOnce(async () => {
      await change(path);

      return initial;
    });

    return handle;
  });
  expect(await observeTextFile(path, 100)).toEqual({ status: "changed" });
});
