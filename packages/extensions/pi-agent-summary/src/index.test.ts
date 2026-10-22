import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as boundedDiff from "@pi-mono/libs/bounded-diff";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { useStepPatchDeadline } from "@pi-mono/libs/validation/bounded-diff";
import { expect, it, vi } from "vite-plus/test";

import { RunChanges } from "./changes.ts";
import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

it("aggregates native edit/write aliases and large files without scanning bash-only changes", async () => {
  const runtime = fixture();
  const directory = join(runtime.ctx.cwd, "real");
  const path = join(directory, "existing.txt");
  const unchanged = "unchanged content\n".repeat(6000);
  mkdirSync(directory);
  writeFileSync(path, `original\nkeep\n${unchanged}`);
  // A directory junction needs no symlink privilege on Windows; other platforms create a symlink.
  symlinkSync(directory, join(runtime.ctx.cwd, "alias"), "junction");
  // Bounded diffs have wall-clock deadlines that a loaded machine can miss; libs tests them.
  const patch = vi
    .spyOn(boundedDiff, "createBoundedPatch")
    .mockResolvedValueOnce({ status: "ready", patch: "@@ -0,0 +1 @@\n+new\n" })
    .mockResolvedValueOnce({
      status: "ready",
      patch: "@@ -1,2 +1,4 @@\n-original\n+final\n+from-edit\n keep\n+extra\n"
    });

  try {
    await runtime.emit("agent_start", {});
    await runtime.tool("edit", {
      path: "alias/existing.txt",
      edits: [{ oldText: "original", newText: "intermediate\nfrom-edit" }]
    });
    await runtime.tool("write", { path, content: `final\nfrom-edit\nkeep\nextra\n${unchanged}` });
    await runtime.tool("write", { path: "@./new.txt", content: "new\n" });
    await runtime.emit("tool_execution_start", {
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId: "shell-only",
      args: { command: "generate files" }
    });
    writeFileSync(join(runtime.ctx.cwd, "shell-only.txt"), "not counted\n");
    writeFileSync(path, "later shell change, not counted\n");
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 0,
      finishedAt: Date.now(),
      bashCalls: 1,
      files: [
        { path: "new.txt", status: "available", added: 1, removed: 0 },
        { path: "real/existing.txt", status: "available", added: 3, removed: 1 }
      ]
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        // File mutations report canonical paths; macOS temporary directories are under /private.
        path: join(realpathSync(runtime.ctx.cwd), "new.txt"),
        before: "",
        after: "new\n",
        timeoutMs: 50
      })
    );
    expect(patch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "file",
        before: `original\nkeep\n${unchanged}`,
        after: `final\nfrom-edit\nkeep\nextra\n${unchanged}`,
        timeoutMs: 50
      })
    );
  } finally {
    patch.mockRestore();
  }
});

it("waits if another extension has already started a run during settlement", async () => {
  const runtime = fixture();
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  vi.advanceTimersByTime(1000);
  runtime.ctx.isIdle = () => false;
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  runtime.ctx.isIdle = () => true;
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 2000,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: []
  });
});

it.each(["session_start", "session_shutdown"] as const)(
  "ignores native completion captured before %s, including after another run starts",
  async (event) => {
    useStepPatchDeadline();
    const runtime = fixture();
    let previous: RunChanges | undefined;
    // The captured method is called below with the observed run as its explicit receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const completed = RunChanges.prototype.completed;
    const capture = vi.spyOn(RunChanges.prototype, "completed").mockImplementation(function (
      this: RunChanges,
      mutation
    ) {
      previous ??= this;

      return completed.call(this, mutation);
    });

    try {
      await runtime.emit("agent_start", {});
      await runtime.tool("write", { path: "baseline.txt", content: "first\n" });
    } finally {
      capture.mockRestore();
    }

    if (!previous) throw new Error("Missing observed run");
    let reset: Promise<void> | undefined;
    const observer = observeFileMutations({
      eligible: (session) => session.sessionManager === runtime.session,
      begin: () => ({
        maxSourceBytes: 0,
        started: () => {
          reset = (async () => {
            await runtime.emit(event, {});
            await runtime.emit("agent_start", {});
          })();
        },
        completed() {}
      })
    });

    try {
      await runtime.tool("write", { path: "late.txt", content: "late\n" });
      await reset;
      expect(await previous.finish()).toEqual([
        { path: "baseline.txt", status: "available", added: 1, removed: 0 }
      ]);
      await runtime.emit("agent_settled", {});
      // After shutdown, the late agent_start starts no run and reconnects no observer.
      expect(vi.mocked(runtime.api.appendEntry).mock.calls).toEqual(
        event === "session_shutdown"
          ? []
          : [[summaryEntryType, { durationMs: 0, finishedAt: Date.now(), bashCalls: 0, files: [] }]]
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      observer.dispose();
    }
  }
);

it("saves summaries outside TUI mode without touching the working UI", async () => {
  useStepPatchDeadline();
  const runtime = fixture("rpc");
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  await runtime.tool("write", { path: "file.txt", content: "new\n" });
  vi.advanceTimersByTime(1250);
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("agent_settled", {});
  await runtime.emit("session_shutdown", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 1250,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: [{ path: "file.txt", status: "available", added: 1, removed: 0 }]
  });
  expect(runtime.setWorkingMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
