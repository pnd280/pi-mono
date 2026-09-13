import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it, vi } from "vite-plus/test";

import type { SavedOutput } from "./display-model.ts";
import { SavedOutputLoader, SAVED_OUTPUT_BYTES } from "./saved-output.ts";
it("loads bounded head/tail files and falls back for missing and nonregular output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-output-"));
  const loader = new SavedOutputLoader();

  try {
    const path = join(directory, "large");
    await writeFile(path, `BEGIN\n${"x\n".repeat(SAVED_OUTPUT_BYTES)}\nEND`);
    const output = await loader.load(path);
    expect(output?.text).toContain("BEGIN");
    expect(output?.text?.endsWith("END")).toBe(true);
    expect(Buffer.byteLength(output?.text ?? "")).toBeLessThan(SAVED_OUTPUT_BYTES + 200);
    expect(output?.notice).toContain("not complete");
    expect(output?.omissions?.map((range) => output.text!.slice(range.start, range.end))).toEqual([
      expect.stringMatching(/^… \d+ retained lines omitted …$/)
    ]);
    expect((await loader.load(join(directory, "missing")))?.notice).toContain("unavailable");
    await mkdir(join(directory, "folder"));
    expect((await loader.load(join(directory, "folder")))?.notice).toContain("regular file");
  } finally {
    loader.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
it("marks only generated omissions, preserving identical literal output and UTF-16 offsets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-output-spans-"));
  const loader = new SavedOutputLoader();

  try {
    const marker = "… 256 bytes omitted …";
    const prefix = `界😀 ${marker}\n`;
    const path = join(directory, "bytes");
    await writeFile(
      path,
      prefix + "x".repeat(SAVED_OUTPUT_BYTES + 256 - Buffer.byteLength(prefix))
    );
    const output = (await loader.load(path))!;
    expect(output.text).toContain(prefix);
    expect(output.omissions).toHaveLength(1);
    const range = output.omissions![0]!;
    expect(range.start).toBeGreaterThan(prefix.length);
    expect(output.text!.slice(range.start, range.end)).toBe(marker);
  } finally {
    loader.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
it("preserves BOMs and literal replacement characters while omitting only split UTF-8 boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-output-unicode-"));
  const loader = new SavedOutputLoader();

  try {
    const complete = join(directory, "complete");
    const text = "\uFEFFstart\nend\uFFFD";
    await writeFile(complete, text);
    expect((await loader.load(complete))?.text).toBe(text);

    const oversized = join(directory, "oversized");
    const head = "x".repeat(SAVED_OUTPUT_BYTES / 2 - 3) + "\uFFFD";
    await writeFile(oversized, head + "界".repeat(SAVED_OUTPUT_BYTES) + "\uFFFD");
    const preview = (await loader.load(oversized))!.text!;
    expect(preview.startsWith(head)).toBe(true);
    expect(preview.endsWith("界\uFFFD")).toBe(true);
    expect(preview.match(/\uFFFD/g)).toHaveLength(2);

    const split = join(directory, "split");
    await writeFile(split, "界".repeat(SAVED_OUTPUT_BYTES));
    const bounded = (await loader.load(split))!.text!;
    expect(bounded).not.toContain("\uFFFD");
    expect(bounded.startsWith("界")).toBe(true);
    expect(bounded.endsWith("界")).toBe(true);
  } finally {
    loader.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
it("deduplicates in-flight loads and rejects stale completions after disposal", async () => {
  let complete!: (output: SavedOutput) => void;
  const load = vi.fn(
    () =>
      new Promise<SavedOutput>((resolve) => {
        complete = resolve;
      })
  );
  const loader = new SavedOutputLoader(load);
  const first = loader.load("saved");
  expect(loader.load("saved")).toBe(first);
  expect(load).toHaveBeenCalledTimes(1);
  loader.dispose();
  complete({ path: "saved", text: "stale" });
  expect(await first).toBeUndefined();
  expect(await loader.load("new")).toBeUndefined();
});
