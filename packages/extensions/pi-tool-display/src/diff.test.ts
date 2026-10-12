import { createBoundedPatch } from "@pi-mono/libs/bounded-diff";
import type { FileMutation, MutationPatch } from "@pi-mono/libs/file-mutations";
import { expect, it, vi } from "vite-plus/test";

import { creationPatch, mutationChange, parseRetainedPatch, sameRetainedHunks } from "./diff.ts";

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
  expect(await mutationChange(created)).toEqual({ kind: "change", change: "creation", patch });
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

// Replay derives a write creation from its content when the call entry omits the patch.
it.each([
  "",
  "line",
  "first\nsecond\n",
  "crlf\r\nlines\r\n",
  "bare\rreturn\n",
  "\n\n",
  "\uFEFFbom\n",
  "unpaired \uD800 surrogate\n",
  "- minus\n+ plus\n@@ marker\n\\ backslash\n"
])("derives the observed creation patch from content %j", async (content) => {
  const observed = await createBoundedPatch({
    path: "/work/file",
    before: "",
    // File mutations observe content as Node writes it.
    after: Buffer.from(content, "utf8").toString("utf8"),
    maxSourceBytes: 8 * 1024 * 1024,
    maxPatchBytes: 128 * 1024,
    maxEditLength: 2000,
    contextLines: 3,
    timeoutMs: 1000
  });
  expect(observed.status).toBe("ready");
  if (observed.status !== "ready") return;
  expect(sameRetainedHunks(observed.patch, creationPatch(content))).toBe(true);
  expect(sameRetainedHunks(observed.patch, creationPatch(`${content}x`))).toBe(false);
});
