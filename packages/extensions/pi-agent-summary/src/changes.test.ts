import { createBoundedPatch, type PatchLimits } from "@pi-mono/libs/bounded-diff";
import type { FileMutation } from "@pi-mono/libs/file-mutations";
import { useStepPatchDeadline } from "@pi-mono/libs/validation/bounded-diff";
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

it("bounds aggregate retained strings but preserves single-patch statistics", async () => {
  useStepPatchDeadline();
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

it("does not mistake a failed final write or an unobserved write for native changes", async () => {
  const changes = new RunChanges("/work");
  // An external writer appends between two native edits, and the second edit reverts the file to
  // its original content; callbacks also settle out of order.
  await changes.completed(mutation("external", "edited\nbash\n", "original\n", 4));
  await changes.completed(mutation("external", "original\n", "edited\n", 3));
  await changes.completed(mutation("file", "before\n", "after\n", 1));
  await changes.completed({ ...mutation("file", "after\n", "before\n", 2), outcome: "failure" });
  expect(await changes.finish()).toEqual([
    {
      path: "external",
      status: "unavailable",
      reason: expect.stringMatching(/outside native edit and write/i) as unknown
    },
    {
      path: "file",
      status: "unavailable",
      reason: expect.stringMatching(/write failed/i) as unknown
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

it("awaits pending statistics without leaking them into the next run", async () => {
  const changes = new RunChanges("/work");
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
