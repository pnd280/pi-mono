import { parsePatch } from "@pi-mono/utils/patch";
import { applyPatch } from "diff";
import { expect, it } from "vite-plus/test";

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

it("produces applicable creation, deletion, CRLF, missing-newline, Unicode, and unchanged patches", async () => {
  for (const [before, after] of [
    ["", "created\n"],
    ["removed\n", ""],
    ["before", "after\n"],
    ["before\r\ncontext\r\n", "after\r\ncontext\r\n"],
    ["same\n", "same\n"],
    ["before\uFFFD\n", "after\n"]
  ]) {
    const result = await change(before!, after!);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.status);
    expect(parsePatch(result.patch, budgets.maxPatchBytes)).toBeDefined();
    expect(applyPatch(before!.replaceAll("\r\n", "\n"), result.patch)).toBe(
      after!.replaceAll("\r\n", "\n")
    );
  }
});

it("allows small changes in large files but bounds source, patch, and edit distance", async () => {
  const before = Array.from({ length: 2500 }, (_, i) => `line ${i}\n`).join("");
  const after = before.replace("line 1250\n", "edited middle\n");
  const result = await change(before, after);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(parsePatch(result.patch, budgets.maxPatchBytes)).toMatchObject({ added: 1, removed: 1 });
  expect((await change("before", "éé", { maxSourceBytes: 3 })).status).toBe("source-too-large");
  expect((await change("before", "after", { maxPatchBytes: 1 })).status).toBe("patch-too-large");
  expect((await change("old\n".repeat(2500), "new\n".repeat(2500))).status).toBe("budget-exceeded");
  expect((await change("\0", "new")).status).toBe("binary");
});

it("keeps the main thread responsive while refusing a two-million-line comparison", async () => {
  const before = "a\n".repeat(2_000_000) + "before\n";
  let yielded = false;
  const timer = setTimeout(() => {
    yielded = true;
  }, 0);

  try {
    const result = await change(before, before.replace("before\n", "after\n"), {
      maxSourceBytes: 8 * 1024 * 1024,
      timeoutMs: 50
    });
    expect(yielded).toBe(true);
    expect(result.status).toBe("budget-exceeded");
    // A terminated worker must not poison subsequent requests.
    expect((await change("before\n", "after\n")).status).toBe("ready");
  } finally {
    clearTimeout(timer);
  }
});

it("survives worker heap exhaustion and starts a healthy worker for the next request", async () => {
  const before = "a\n".repeat(2_000_000) + "before\n";
  expect(
    await change(before, before.replace("before\n", "after\n"), {
      maxSourceBytes: 8 * 1024 * 1024,
      // Give the worker enough time to hit its heap limit instead of the 50 ms deadline.
      timeoutMs: 5000
    })
  ).toEqual({ status: "budget-exceeded" });
  expect((await change("before", "after")).status).toBe("ready");
});

it("skips line tokenization for identical large sources", async () => {
  const source = "a\n".repeat(2_000_000);
  const result = await change(source, source, { maxSourceBytes: 8 * 1024 * 1024 });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(parsePatch(result.patch, budgets.maxPatchBytes)).toEqual({
    hunks: [],
    added: 0,
    removed: 0
  });
});

it("bounds queued requests and retained inputs without poisoning the queue", async () => {
  const requests = Array.from({ length: 5 }, () => change("before", "after"));
  expect(await requests[4]).toEqual({ status: "budget-exceeded" });
  expect((await Promise.all(requests.slice(0, 4))).map((result) => result.status)).toEqual([
    "ready",
    "ready",
    "ready",
    "ready"
  ]);
  const source = "x".repeat(17 * 1024 * 1024);
  expect(await change(source, source, { maxSourceBytes: source.length })).toEqual({
    status: "budget-exceeded"
  });
  expect((await change("before", "after")).status).toBe("ready");
});

it("honors zero work budgets and rejects invalid options", async () => {
  expect(await change("before", "after", { timeoutMs: 0 })).toEqual({ status: "budget-exceeded" });
  await expect(change("a", "b", { contextLines: -1 })).rejects.toThrow(RangeError);
  await expect(change("a", "b", { timeoutMs: Infinity })).rejects.toThrow(RangeError);
});
