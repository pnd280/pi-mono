import { createBoundedPatch, type PatchLimits } from "@pi-mono/libs/bounded-diff";
import type { FileMutation } from "@pi-mono/libs/file-mutations";
import { expect, it } from "vite-plus/test";

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
    patch: (limits: PatchLimits) =>
      createBoundedPatch({ path, before: before ?? "", after, ...limits })
  };
}

it("uses a native patch when source observation cannot supply a comparison", async () => {
  const changes = new RunChanges("/work");
  await changes.completed({
    ...mutation("file", "before\n", "after\nextra\n"),
    before: { status: "too-large" },
    after: { status: "too-large" },
    patch: async () => ({ status: "ready", patch: "@@ -1 +1,2 @@\n-before\n+after\n+extra\n" })
  });
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 2, removed: 1 }
  ]);
});

it("counts empty creations and omits fully reverted edits", async () => {
  const changes = new RunChanges("/work");
  await changes.completed(mutation("empty", undefined, ""));
  await changes.completed(mutation("reverted", "old\n", "new\n"));
  await changes.completed(mutation("reverted", "new\n", "old\n", 2));
  expect(await changes.finish()).toEqual([
    { path: "empty", status: "available", added: 0, removed: 0 }
  ]);
});

it("uses mutation order rather than callback order for net statistics", async () => {
  const changes = new RunChanges("/work");
  const later = mutation("file", "middle\n", "last\nextra\n", 2);
  const earlier = mutation("file", "old\n", "middle\n", 1);
  const laterRecording = changes.completed(later);
  const earlierRecording = changes.completed(earlier);
  await Promise.all([laterRecording, earlierRecording]);
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 2, removed: 1 }
  ]);
});

it("bounds aggregate retained strings but preserves single-patch statistics", async () => {
  const changes = new RunChanges("/work", 90);
  await changes.completed(mutation("one", "old long line\n", "new long line\n"));
  await changes.completed(mutation("two", "old long line\n", "new long line\n"));
  await changes.completed(mutation("three", "old long line\n", "new long line\n"));
  await changes.completed(mutation("two", "new long line\n", "last long line\n", 2));
  expect(await changes.finish()).toEqual([
    { path: "one", status: "available", added: 1, removed: 1 },
    { path: "three", status: "available", added: 1, removed: 1 },
    {
      path: "two",
      status: "unavailable",
      reason: expect.stringMatching(/retention.*90/i) as unknown
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
  await changes.completed(oversized);
  await changes.completed(final);
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 1, removed: 1 }
  ]);
});

it("recovers the net comparison after a failed intermediate write", async () => {
  const changes = new RunChanges("/work");
  await changes.completed(mutation("file", "before\n", "first\n", 1));
  await changes.completed({ ...mutation("file", "first\n", "proposed\n", 2), outcome: "failure" });
  await changes.completed(mutation("file", "partially written", "after\n", 3));
  expect(await changes.finish()).toEqual([
    { path: "file", status: "available", added: 1, removed: 1 }
  ]);
});

it("does not mistake a failed final write for a reverted change", async () => {
  const changes = new RunChanges("/work");
  await changes.completed(mutation("file", "before\n", "after\n", 1));
  await changes.completed({ ...mutation("file", "after\n", "before\n", 2), outcome: "failure" });
  expect(await changes.finish()).toEqual([
    {
      path: "file",
      status: "unavailable",
      reason: expect.stringMatching(/write failed/i) as unknown
    }
  ]);
});

it("preserves a known source limit when no tool patch is available", async () => {
  const changes = new RunChanges("/work");
  const oversized = mutation("large", "before", "after");
  oversized.after = { status: "too-large" };
  oversized.patch = async () => ({ status: "source-unavailable" });
  await changes.completed(oversized);
  expect(await changes.finish()).toEqual([
    {
      path: "large",
      status: "unavailable",
      reason: expect.stringMatching(/source.*8 MiB/i) as unknown
    }
  ]);
});

it("reports invalid sources, failed writes, and the package's diff limit as unavailable", async () => {
  const changes = new RunChanges("/work");
  await changes.completed(mutation("binary", "before", "a\0b"));
  await changes.completed({
    ...mutation("invalid", "before", "after"),
    before: { status: "invalid-utf8" }
  });
  await changes.completed({ ...mutation("failed", "before", "after"), outcome: "failure" });
  await changes.completed(mutation("many-lines", undefined, "line\n".repeat(2001)));
  expect(await changes.finish()).toEqual([
    {
      path: "binary",
      status: "unavailable",
      reason: expect.stringMatching(/binary/i) as unknown
    },
    {
      path: "failed",
      status: "unavailable",
      reason: expect.stringMatching(/write failed/i) as unknown
    },
    {
      path: "invalid",
      status: "unavailable",
      reason: expect.stringMatching(/UTF-8/) as unknown
    },
    {
      path: "many-lines",
      status: "unavailable",
      reason: expect.stringMatching(/diff.*2000/i) as unknown
    }
  ]);
});

it.each([
  ["queue-full", /queue/i],
  ["worker-failed", /worker/i]
] as const)("reports %s separately from a diff work limit", async (status, reason) => {
  const changes = new RunChanges("/work");
  const change = mutation("file", "before\n", "after\n");
  change.patch = async () => ({ status });
  await changes.completed(change);
  expect(await changes.finish()).toEqual([
    { path: "file", status: "unavailable", reason: expect.stringMatching(reason) as unknown }
  ]);
});

it("omits unchanged files and awaits pending statistics without leaking them into the next run", async () => {
  const changes = new RunChanges("/work");
  await changes.completed(mutation("unchanged", "same\n", "same\n"));
  const change = mutation("file", "before\n", "after\n");
  const pending = Promise.withResolvers<Awaited<ReturnType<FileMutation["patch"]>>>();
  change.patch = () => pending.promise;
  const recording = changes.completed(change);
  const finished = changes.finish();
  pending.resolve({ status: "ready", patch: "@@ -1 +1 @@\n-before\n+after\n" });
  await recording;
  expect(await finished).toEqual([{ path: "file", status: "available", added: 1, removed: 1 }]);
  expect(await changes.finish()).toEqual([]);
});
