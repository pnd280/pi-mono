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
    const slow = change(before, before.replace("before\n", "after\n"), {
      maxSourceBytes: 8 * 1024 * 1024,
      timeoutMs: 50
    });
    const queued = change("before\n", "after\n", { timeoutMs: 50 });
    expect((await slow).status).toBe("budget-exceeded");
    expect(yielded).toBe(true);
    // Waiting behind a timed-out worker must not consume the next request's work budget.
    expect((await queued).status).toBe("ready");
  } finally {
    clearTimeout(timer);
  }
});

it("survives worker heap exhaustion and starts a healthy worker for the next request", async () => {
  const before = "a\n".repeat(2_000_000) + "before\n";
  const exhausted = change(before, before.replace("before\n", "after\n"), {
    maxSourceBytes: 8 * 1024 * 1024,
    // Give the worker enough time to hit its heap limit instead of the 50 ms deadline.
    timeoutMs: 5000
  });
  const queued = change("before", "after", { timeoutMs: 50 });
  expect(await exhausted).toEqual({ status: "worker-failed" });
  expect((await queued).status).toBe("ready");
});

it("skips line tokenization for identical large sources", async () => {
  const source = "a\n".repeat(2_000_000);
  const result = await change(source, source, { maxSourceBytes: 8 * 1024 * 1024 });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(parsePatch(result.patch, budgets.maxPatchBytes)).toMatchObject({ added: 0, removed: 0 });
});

it("queues a burst of ten small creations instead of dropping files after the fourth", async () => {
  const sources = Array.from({ length: 10 }, (_, index) => `file ${index}\n`.repeat(25));
  const results = await Promise.all(sources.map((source) => change("", source, { timeoutMs: 50 })));

  for (const [index, result] of results.entries()) {
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.status);
    expect(applyPatch("", result.patch)).toBe(sources[index]);
  }
});

it("bounds active and waiting inputs together and releases capacity after draining", async () => {
  const source = "x".repeat(6 * 1024 * 1024);
  const large = () => change(source, source, { maxSourceBytes: source.length });
  // Each request retains 24 MiB of UTF-16 input plus its path and bookkeeping.
  const accepted = [large(), large()];
  expect(await large()).toEqual({ status: "queue-full" });
  expect((await Promise.all(accepted)).map((result) => result.status)).toEqual(["ready", "ready"]);
  expect((await large()).status).toBe("ready");
  const oversized = "x".repeat(17 * 1024 * 1024);
  expect(await change(oversized, oversized, { maxSourceBytes: oversized.length })).toEqual({
    status: "queue-full"
  });
  expect((await change("before", "after")).status).toBe("ready");
});

it("queues only declared options without cloning unrelated caller data", async () => {
  const options = {
    ...budgets,
    path: "file",
    before: "before\n",
    after: "after\n",
    // Structural typing permits extra fields, including values a worker cannot clone.
    onComplete: () => {}
  };
  const result = await createBoundedPatch(options);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(applyPatch(options.before, result.patch)).toBe(options.after);
});
