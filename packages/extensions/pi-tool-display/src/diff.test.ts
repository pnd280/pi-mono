import type { FileMutation, MutationPatch } from "@pi-mono/libs/file-mutations";
import { expect, it, vi } from "vite-plus/test";

import { mutationChange, parseRetainedPatch, OBSERVATION_BYTES, PATCH_BYTES } from "./diff.ts";

function mutation(result: MutationPatch, created = false): FileMutation {
  return {
    path: "/work/file",
    sequence: 1,
    durationMs: 0,
    outcome: "success",
    before: created ? { status: "missing" } : { status: "ready", text: "before\n" },
    after: { status: "ready", text: "after\n" },
    patch: vi.fn(async () => result)
  };
}

it("retains shared patches and derives creation/modification facts", async () => {
  const patch = "--- file\n+++ file\n@@ -0,0 +1 @@\n+created\n";
  const created = mutation({ status: "ready", patch }, true);
  expect(await mutationChange(created)).toMatchObject({
    availability: "available",
    change: "creation",
    patch
  });
  expect(created.patch).toHaveBeenCalledExactlyOnceWith({
    maxSourceBytes: OBSERVATION_BYTES,
    maxPatchBytes: PATCH_BYTES,
    maxEditLength: 2000,
    timeoutMs: 50,
    contextLines: 4
  });
  expect((await mutationChange(mutation({ status: "ready", patch }))).change).toBe("modification");
  expect(parseRetainedPatch(patch)?.added).toBe(1);
});

it("applies patch retention limits and reports shared observation failures", async () => {
  expect(parseRetainedPatch("@@ -0,0 +1 @@\n+" + "x".repeat(PATCH_BYTES))).toBeUndefined();
  for (const [status, reason] of [
    ["source-too-large", "Change exceeds the 8 MiB observation budget."],
    ["budget-exceeded", "Diff generation exceeded 50 ms or 2000 changed lines."],
    ["queue-full", "Diff queue exceeds its 64 MiB memory budget."],
    ["worker-failed", "Diff worker failed to start or complete the comparison."],
    ["binary", "Binary content."]
  ] as const)
    expect(await mutationChange(mutation({ status }))).toMatchObject({
      availability: "unavailable",
      reason
    });
});
