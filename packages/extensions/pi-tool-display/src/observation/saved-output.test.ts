import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

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
