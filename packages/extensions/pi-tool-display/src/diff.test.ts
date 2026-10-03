import type { FileMutation, MutationPatch } from "@pi-mono/libs/file-mutations";
import { expect, it, vi } from "vite-plus/test";

import { mutationChange, parseRetainedPatch } from "./diff.ts";

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
  expect(created.patch).toHaveBeenCalledWith(
    expect.objectContaining({
      maxSourceBytes: 8 * 1024 * 1024,
      maxPatchBytes: 128 * 1024,
      maxEditLength: 2000,
      timeoutMs: 50
    })
  );
  expect((await mutationChange(mutation({ status: "ready", patch }))).change).toBe("modification");
});

it("rejects retained patches exceeding the persistence bound", () => {
  expect(parseRetainedPatch("@@ -0,0 +1 @@\n+" + "x".repeat(128 * 1024))).toBeUndefined();
});
