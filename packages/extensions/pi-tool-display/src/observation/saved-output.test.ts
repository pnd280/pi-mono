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
