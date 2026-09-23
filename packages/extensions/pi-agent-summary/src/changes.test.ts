import { createBoundedPatch, type PatchLimits } from "@pi-mono/libs/bounded-diff";
import type { FileMutation } from "@pi-mono/libs/file-mutations";
import { expect, it, vi } from "vite-plus/test";

import { RunChanges } from "./changes.ts";

function mutation(
  path: string,
  before: string | undefined,
  after: string,
  sequence = 1
): FileMutation {
  return {
    path: `/work/${path}`,
    sequence,
    durationMs: 0,
    outcome: "success",
    before: before === undefined ? { status: "missing" } : { status: "ready", text: before },
    after: { status: "ready", text: after },
    patch: vi.fn((limits: PatchLimits) =>
      createBoundedPatch({ path, before: before ?? "", after, ...limits })
    )
  };
}

it("reuses a single tool patch without retaining its closure or regenerating the diff", async () => {
  const changes = new RunChanges("/work");
  const change = mutation("file", "before\n", "after\n");
  await changes.record(change);
  expect(change.patch).toHaveBeenCalledTimes(1);
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 1, removed: 1 }
  ]);
  expect(change.patch).toHaveBeenCalledTimes(1);
});

it("counts empty creations and unterminated lines, and omits fully reverted edits", async () => {
  const changes = new RunChanges("/work");
  await changes.record(mutation("empty", undefined, ""));
  await changes.record(mutation("lines", undefined, "one\r\ntwo"));
  await changes.record(mutation("reverted", "old\n", "new\n"));
  await changes.record(mutation("reverted", "new\n", "old\n", 2));
  expect(await changes.finish()).toEqual([
    { path: "empty", status: "available", added: 0, removed: 0 },
    { path: "lines", status: "available", added: 2, removed: 0 }
  ]);
});

it("uses mutation order rather than callback order and does not diff intermediate changes", async () => {
  const changes = new RunChanges("/work");
  const later = mutation("file", "middle\n", "last\nextra\n", 2);
  const earlier = mutation("file", "old\n", "middle\n", 1);
  const laterRecording = changes.record(later);
  const earlierRecording = changes.record(earlier);
  await Promise.all([laterRecording, earlierRecording]);
  expect(earlier.patch).not.toHaveBeenCalled();
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 2, removed: 1 }
  ]);
});

it("bounds aggregate retained strings but preserves single-patch statistics", async () => {
  const changes = new RunChanges("/work", 90);
  await changes.record(mutation("one", "old long line\n", "new long line\n"));
  await changes.record(mutation("two", "old long line\n", "new long line\n"));
  await changes.record(mutation("three", "old long line\n", "new long line\n"));
  await changes.record(mutation("two", "new long line\n", "last long line\n", 2));
  expect(await changes.finish()).toEqual([
    { path: "one", status: "available", added: 1, removed: 1 },
    { path: "three", status: "available", added: 1, removed: 1 },
    {
      path: "two",
      status: "unavailable",
      reason: "Run source retention budget exceeded (90 bytes)."
    }
  ]);
});

it("uses only baseline and latest sources when intermediate observations are unavailable", async () => {
  const changes = new RunChanges("/work");
  const oversized = mutation("file", "before\n", "oversized", 1);
  oversized.after = { status: "too-large" };
  oversized.patch = async () => ({ status: "source-unavailable" });
  const final = mutation("file", "oversized", "after\n", 2);
  final.before = { status: "too-large" };
  await changes.record(oversized);
  await changes.record(final);
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 1, removed: 1 }
  ]);
});

it("recovers the net comparison after a failed intermediate write", async () => {
  const changes = new RunChanges("/work");
  await changes.record(mutation("file", "before\n", "first\n", 1));
  await changes.record({ ...mutation("file", "first\n", "proposed\n", 2), outcome: "failure" });
  await changes.record(mutation("file", "partially written", "after\n", 3));
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 1, removed: 1 }
  ]);
});

it("does not mistake a failed final write for a reverted change", async () => {
  const changes = new RunChanges("/work");
  await changes.record(mutation("file", "before\n", "after\n", 1));
  await changes.record({ ...mutation("file", "after\n", "before\n", 2), outcome: "failure" });
  expect(await changes.finish()).toEqual([
    {
      path: "file",
      status: "unavailable",
      reason: "File write failed; final contents were not observed."
    }
  ]);
});

it("preserves a known source limit when no tool patch is available", async () => {
  const changes = new RunChanges("/work");
  const oversized = mutation("large", "before", "after");
  oversized.after = { status: "too-large" };
  oversized.patch = async () => ({ status: "source-unavailable" });
  await changes.record(oversized);
  expect(await changes.finish()).toEqual([
    {
      path: "large",
      status: "unavailable",
      reason: "Source exceeds the 8 MiB observation budget."
    }
  ]);
});

it("distinguishes invalid source, failed writes, and generated diff budgets", async () => {
  const changes = new RunChanges("/work");
  await changes.record(mutation("binary", "before", "a\0b"));
  await changes.record({
    ...mutation("invalid", "before", "after"),
    before: { status: "invalid-utf8" }
  });
  await changes.record({ ...mutation("failed", "before", "after"), outcome: "failure" });
  await changes.record(mutation("many-lines", undefined, "line\n".repeat(2001)));
  expect(await changes.finish()).toEqual([
    { path: "binary", status: "unavailable", reason: "Binary content." },
    {
      path: "failed",
      status: "unavailable",
      reason: "File write failed; final contents were not observed."
    },
    { path: "invalid", status: "unavailable", reason: "Source is not valid UTF-8." },
    {
      path: "many-lines",
      status: "unavailable",
      reason: "Diff generation exceeded 50 ms, 2000 changed lines, or worker resources."
    }
  ]);
});

it("skips patch generation for unchanged source and awaits pending single-file statistics", async () => {
  const changes = new RunChanges("/work");
  const unchanged = mutation("unchanged", "same\n", "same\n");
  await changes.record(unchanged);
  expect(unchanged.patch).not.toHaveBeenCalled();
  const change = mutation("file", "before\n", "after\n");
  let complete!: (value: Awaited<ReturnType<FileMutation["patch"]>>) => void;
  const pending = new Promise<Awaited<ReturnType<FileMutation["patch"]>>>((resolve) => {
    complete = resolve;
  });
  change.patch = () => pending;
  const recording = changes.record(change);
  const finished = changes.finish();
  complete({ status: "ready", patch: "@@ -1 +1 @@\n-before\n+after\n" });
  await recording;
  expect(await finished).toEqual([{ path: "file", status: "available", added: 1, removed: 1 }]);
  expect(await changes.finish()).toEqual([]);
});
