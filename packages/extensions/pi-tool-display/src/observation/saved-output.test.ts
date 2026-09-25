import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { SavedOutputLoader } from "./saved-output.ts";

it("retains both ends of oversized saved output and reports unavailable files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-output-"));
  const loader = new SavedOutputLoader();

  try {
    const path = join(directory, "large");
    await writeFile(path, `BEGIN\n${"x\n".repeat(150_000)}END`);
    const output = await loader.load(path);
    expect(output?.text).toContain("BEGIN");
    expect(output?.text?.endsWith("END")).toBe(true);
    expect(Buffer.byteLength(output?.text ?? "")).toBeLessThan(256 * 1024 + 1024);
    expect(output?.notice).toContain("not complete");
    expect(output?.omissions?.length).toBeGreaterThan(0);
    expect((await loader.load(join(directory, "missing")))?.notice).toContain("retained output");
    await mkdir(join(directory, "folder"));
    expect((await loader.load(join(directory, "folder")))?.notice).toContain("retained output");
  } finally {
    loader.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
