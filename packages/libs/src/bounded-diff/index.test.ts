import { parsePatch } from "@pi-mono/utils/patch";
import { applyPatch } from "diff";
import { expect, it, vi } from "vite-plus/test";

import { createBoundedPatch, type BoundedPatchOptions } from "./index.ts";

const budgets = {
  maxSourceBytes: 64 * 1024,
  maxPatchBytes: 128 * 1024,
  maxEditLength: 2000,
  timeoutMs: 1000,
  contextLines: 4
};
const change = (before: string, after: string, options: Partial<BoundedPatchOptions> = {}) =>
  createBoundedPatch({ ...budgets, path: "space and 界.txt", before, after, ...options });

it("produces applicable creation, deletion, CRLF, missing-newline, Unicode, and unchanged patches", () => {
  for (const [before, after] of [
    ["", "created\n"],
    ["removed\n", ""],
    ["before", "after\n"],
    ["before\r\ncontext\r\n", "after\r\ncontext\r\n"],
    ["same\n", "same\n"],
    ["before\uFFFD\n", "after\n"]
  ]) {
    const result = change(before!, after!);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.status);
    expect(parsePatch(result.patch, budgets.maxPatchBytes)).toBeDefined();
    expect(applyPatch(before!.replaceAll("\r\n", "\n"), result.patch)).toBe(
      after!.replaceAll("\r\n", "\n")
    );
  }
});

it("allows small changes in large files but bounds source, patch, and edit distance", () => {
  const before = Array.from({ length: 2500 }, (_, i) => `line ${i}\n`).join("");
  const after = before.replace("line 1250\n", "edited middle\n");
  const result = change(before, after);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(parsePatch(result.patch, budgets.maxPatchBytes)).toMatchObject({ added: 1, removed: 1 });
  expect(change("before", "éé", { maxSourceBytes: 3 }).status).toBe("source-too-large");
  expect(change("before", "after", { maxPatchBytes: 1 }).status).toBe("patch-too-large");
  expect(change("old\n".repeat(2500), "new\n".repeat(2500)).status).toBe("budget-exceeded");
  expect(change("\0", "new").status).toBe("binary");
});

it("honors the elapsed-time budget and validates options", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(100);

  try {
    expect(change("before", "after", { timeoutMs: 1 }).status).toBe("budget-exceeded");
  } finally {
    clock.mockRestore();
  }

  expect(() => change("a", "b", { contextLines: -1 })).toThrow(RangeError);
  expect(() => change("a", "b", { timeoutMs: Infinity })).toThrow(RangeError);
});
