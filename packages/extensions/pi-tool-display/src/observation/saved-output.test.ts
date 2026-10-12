import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { readSavedOutput } from "./saved-output.ts";

it.each([
  {
    limit: "bytes",
    source: `BEGIN\n${"x".repeat(256 * 1024)}\nEND`,
    omission: "… 10 bytes omitted …"
  },
  {
    limit: "lines",
    source: `BEGIN\n${"x\n".repeat(4000)}END`,
    omission: "… 2 retained lines omitted …"
  }
])(
  "bounds saved-output $limit independently while retaining both ends",
  async ({ source, omission }) => {
    const directory = await mkdtemp(join(tmpdir(), "display-output-"));

    try {
      const path = join(directory, "large");
      await writeFile(path, source);
      const output = await readSavedOutput(path);
      const text = output.text ?? "";
      expect(text.startsWith("BEGIN\n")).toBe(true);
      expect(text.endsWith("\nEND")).toBe(true);
      expect(Buffer.byteLength(text)).toBeLessThan(256 * 1024 + 1024);
      expect(text.split("\n").length).toBeLessThanOrEqual(4001);
      expect(output.notice).toContain("not complete");
      expect(output.omissions?.map(({ start, end }) => text.slice(start, end))).toEqual([omission]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it("reports unavailable saved-output files without replacing retained output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-output-"));

  try {
    expect((await readSavedOutput(join(directory, "missing"))).notice).toContain("retained output");
    await mkdir(join(directory, "folder"));
    expect((await readSavedOutput(join(directory, "folder"))).notice).toContain("retained output");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
