import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { outputOmission } from "@pi-mono/utils/output-text";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { readBoundedOutput, type BoundedOutputOptions } from "./index.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bounded-output-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const options = {
  maxBytes: 64,
  maxLines: 4,
  formatOmission: ({ count, unit }) => outputOmission(`[${count} ${unit}]`)
} satisfies BoundedOutputOptions;

it("uses caller-selected byte and line bounds without changing the source", async () => {
  const path = join(directory, "output");
  const text = "BEGIN\n" + "x".repeat(100) + "\nEND";
  await writeFile(path, text);
  const result = await readBoundedOutput(path, { ...options, maxBytes: 17, maxLines: 10 });
  expect(result).toMatchObject({ status: "ready", truncated: true });
  if (result.status !== "ready") throw new Error("Expected readable output");
  expect(result.output.text).toBe(`BEGIN\nxxx\n[${Buffer.byteLength(text) - 17} bytes]\nxxxx\nEND`);
  expect(await readFile(path, "utf8")).toBe(text);

  await writeFile(path, "BEGIN\na\nb\nc\nd\nEND");
  const lines = await readBoundedOutput(path, { ...options, maxLines: 3 });
  expect(lines).toMatchObject({
    status: "ready",
    truncated: true,
    output: { text: "BEGIN\na\n[3 retained-lines]\nEND" }
  });
});

it("marks only generated text using UTF-16 offsets and preserves literal marker lookalikes", async () => {
  const path = join(directory, "output");
  const prefix = "😀 [10 bytes]\n";
  await writeFile(path, prefix + "x".repeat(74 - Buffer.byteLength(prefix)));
  const result = await readBoundedOutput(path, options);
  if (result.status !== "ready") throw new Error("Expected readable output");
  expect(result.output.text).toContain(prefix);
  expect(result.output.omissions).toHaveLength(1);
  const range = result.output.omissions![0]!;
  expect(range.start).toBeGreaterThan(prefix.length);
  expect(result.output.text.slice(range.start, range.end)).toBe("[10 bytes]");
});

it("omits split UTF-8 edges without discarding literal replacement characters", async () => {
  const path = join(directory, "output");
  await writeFile(path, "\uFFFD" + "界".repeat(20) + "\uFFFD");
  const result = await readBoundedOutput(path, { ...options, maxBytes: 16 });
  expect(result).toMatchObject({
    status: "ready",
    truncated: true,
    output: { text: "\uFFFD界\n[50 bytes]\n界\uFFFD" }
  });
});

it("distinguishes complete, empty, missing, and nonregular files", async () => {
  const path = join(directory, "output");
  await writeFile(path, "\uFEFFstart\nend\uFFFD");
  expect(await readBoundedOutput(path, options)).toEqual({
    status: "ready",
    truncated: false,
    output: { text: "\uFEFFstart\nend\uFFFD" }
  });
  await writeFile(path, "");
  expect(await readBoundedOutput(path, options)).toEqual({
    status: "ready",
    truncated: false,
    output: { text: "" }
  });
  expect(await readBoundedOutput(directory, options)).toEqual({ status: "not-file" });
  expect(await readBoundedOutput(join(directory, "missing"), options)).toEqual({
    status: "unavailable"
  });
  await expect(readBoundedOutput(path, { ...options, maxBytes: 0 })).rejects.toThrow(RangeError);
});

it.skipIf(process.platform === "win32")("does not wait for a FIFO writer", async () => {
  const path = join(directory, "pipe");
  execFileSync("mkfifo", [path]);
  expect(await readBoundedOutput(path, options)).toEqual({ status: "not-file" });
});
