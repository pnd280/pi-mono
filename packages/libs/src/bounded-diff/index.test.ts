import { parsePatch } from "@pi-mono/utils/patch";
import { expect, it } from "vite-plus/test";

import { STEP_TIMEOUT_MS } from "../validation/pi-process/index.ts";
import { createBoundedPatch, type BoundedPatchOptions } from "./index.ts";

const budgets = {
  maxSourceBytes: 64 * 1024,
  maxPatchBytes: 128 * 1024,
  maxEditLength: 2000,
  // The deadline is wall-clock time that suite load can exceed; no test here asserts it.
  timeoutMs: STEP_TIMEOUT_MS,
  contextLines: 4
};
const change = (before: string, after: string, options: Partial<BoundedPatchOptions> = {}) =>
  createBoundedPatch({ ...budgets, path: "space and 界.txt", before, after, ...options });

it("allows small changes in large files but bounds source, patch, and edit distance", async () => {
  const before = Array.from({ length: 2500 }, (_, i) => `line ${i}\n`).join("");
  const after = before.replace("line 1250\n", "edited middle\n");
  const result = await change(before, after);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.status);
  expect(parsePatch(result.patch, budgets.maxPatchBytes)).toMatchObject({ added: 1, removed: 1 });
  expect((await change("", "éé", { maxSourceBytes: 3 })).status).toBe("source-too-large");
  expect((await change("before", "after", { maxPatchBytes: 1 })).status).toBe("patch-too-large");
  // 500 line edits exceed the edit budget; a smaller budget keeps the search cheap.
  expect(
    (await change("old\n".repeat(250), "new\n".repeat(250), { maxEditLength: 200 })).status
  ).toBe("budget-exceeded");
  expect((await change("\0", "new")).status).toBe("binary");
});

it("survives worker heap exhaustion, bounds queued source, and serves later requests", async () => {
  const before = "a\n".repeat(2_000_000) + "before\n";
  const exhausted = change(before, before.replace("before\n", "after\n"), {
    maxSourceBytes: 8 * 1024 * 1024
  });
  // Each large request retains 32 MiB of queued source; the second exceeds the shared budget.
  // A 1 ms deadline keeps the admitted one from doing real work.
  const large = "a".repeat(8 * 1024 * 1024);
  const largeLimits = { maxSourceBytes: large.length, timeoutMs: 1 };
  const admitted = change(large, large, largeLimits);
  expect(await change(large, large, largeLimits)).toEqual({ status: "queue-full" });
  const queued = change("before", "after");
  expect(await exhausted).toEqual({ status: "worker-failed" });
  expect((await admitted).status).not.toBe("queue-full");
  expect((await queued).status).toBe("ready");
  expect((await change(large, large, largeLimits)).status).not.toBe("queue-full");
});
