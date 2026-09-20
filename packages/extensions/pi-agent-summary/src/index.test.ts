import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { expect, expectTypeOf, it, vi } from "vite-plus/test";

import entry from "../index.ts";
import { RunChanges } from "./changes.ts";
import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

it("records one context-free entry after all turns and retries settle, preserving other working text", async () => {
  expectTypeOf(entry).toExtend<ExtensionFactory>();
  const runtime = await fixture();
  const other = registerWorkingMessage(runtime.api, {
    id: "other.activity",
    label: "Activity",
    contributor: "other"
  });
  runtime.session.appendMessage({ role: "user", content: "Work", timestamp: Date.now() });
  const before = runtime.session.buildSessionContext().messages;
  await runtime.emit("session_start", {});
  other.setText("Checking files");
  await runtime.emit("agent_start", {});
  await runtime.tool("bash", { command: "true" });
  vi.advanceTimersByTime(2000);
  expect(runtime.setWorkingMessage).toHaveBeenLastCalledWith("Checking files · 2s");
  await runtime.emit("turn_end", {});
  await runtime.emit("agent_end", {});
  vi.advanceTimersByTime(1000);
  await runtime.emit("agent_start", {});
  await expect(runtime.tool("bash", { command: "false" })).rejects.toThrow();
  vi.advanceTimersByTime(1500);
  expect(runtime.api.appendEntry).not.toHaveBeenCalled();
  await runtime.emit("agent_settled", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 4500,
    bashCalls: 2,
    files: []
  });
  expect(runtime.session.getLeafEntry()).toMatchObject({
    type: "custom",
    customType: summaryEntryType,
    data: { durationMs: 4500, bashCalls: 2, files: [] }
  });
  expect(runtime.session.buildSessionContext().messages).toEqual(before);
  expect(runtime.setWorkingMessage).toHaveBeenLastCalledWith("Checking files");
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("session_shutdown", {});
});

it("counts unique edit/write files and net lines, without scanning bash-only files", async () => {
  const runtime = await fixture();
  const path = join(runtime.ctx.cwd, "existing.txt");
  writeFileSync(path, "original\nkeep\n");
  await runtime.emit("agent_start", {});
  await runtime.tool("edit", {
    path: "existing.txt",
    edits: [{ oldText: "original", newText: "intermediate" }]
  });
  await runtime.tool("write", { path, content: "final\nkeep\nextra\n" });
  await runtime.tool("write", { path: "@./new.txt", content: "new\n" });
  await runtime.tool("bash", { command: "generate files" }, () => {
    writeFileSync(join(runtime.ctx.cwd, "shell-only.txt"), "not counted\n");
    writeFileSync(path, "later shell change, not counted\n");
  });
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    bashCalls: 1,
    files: [
      { path: "existing.txt", status: "available", added: 2, removed: 1 },
      { path: "new.txt", status: "available", added: 1, removed: 0 }
    ]
  });
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
    durationMs: 0,
    bashCalls: 0,
    files: []
  });
});

it.each(["edit", "write"])(
  "counts a small %s change in a file larger than 64 KiB",
  async (name) => {
    const runtime = await fixture();
    const path = join(runtime.ctx.cwd, "large.txt");
    const before = "unchanged content\n".repeat(6000) + "before\n";
    writeFileSync(path, before);
    await runtime.emit("agent_start", {});
    await runtime.tool(
      name,
      name === "edit"
        ? { path, edits: [{ oldText: "before", newText: "after" }] }
        : { path, content: before.replace("before\n", "after\n") }
    );
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
      durationMs: 0,
      bashCalls: 0,
      files: [{ path: "large.txt", status: "available", added: 1, removed: 1 }]
    });
  }
);

it("omits reverted and failed edits and deduplicates existing symlink aliases", async () => {
  const runtime = await fixture();
  const path = join(runtime.ctx.cwd, "file.txt");
  writeFileSync(path, "old\n");
  symlinkSync(path, join(runtime.ctx.cwd, "alias.txt"));
  await runtime.emit("agent_start", {});
  await runtime.tool("edit", { path: "alias.txt", edits: [{ oldText: "old", newText: "new" }] });
  await runtime.tool("edit", { path: "file.txt", edits: [{ oldText: "new", newText: "old" }] });
  await expect(
    runtime.tool("edit", {
      path: "missing.txt",
      edits: [{ oldText: "old", newText: "new" }]
    })
  ).rejects.toThrow();
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    bashCalls: 0,
    files: []
  });
});

it("counts bash calls at start, including unfinished and blocked calls, but not user bash", async () => {
  const runtime = await fixture();
  await runtime.emit("agent_start", {});
  for (const toolCallId of ["failed", "cancelled", "blocked", "blocked"])
    await runtime.emit("tool_execution_start", {
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId,
      args: { command: "false" }
    });
  await runtime.emit("user_bash", { command: "true" });
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    bashCalls: 3,
    files: []
  });
});

it("waits if another extension has already started a run during settlement", async () => {
  const runtime = await fixture();
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
    bashCalls: 0,
    files: []
  });
  await runtime.emit("session_shutdown", {});
});

it("cleans up unfinished runs on shutdown without appending a partial summary", async () => {
  const runtime = await fixture();
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  await runtime.tool("write", { path: "file.txt", content: "new\n" });
  vi.advanceTimersByTime(1000);
  await runtime.emit("session_shutdown", {});
  await runtime.emit("session_shutdown", {});
  await runtime.emit("agent_settled", {});
  const updates = runtime.setWorkingMessage.mock.calls.length;
  vi.advanceTimersByTime(5000);
  expect(runtime.api.appendEntry).not.toHaveBeenCalled();
  expect(runtime.setWorkingMessage).toHaveBeenCalledTimes(updates);
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    bashCalls: 0,
    files: []
  });
});

it.each(["session_shutdown", "session_start"] as const)(
  "discards a pending net comparison after %s",
  async (event) => {
    const runtime = await fixture();
    await runtime.emit("agent_start", {});
    let complete!: (value: Awaited<ReturnType<RunChanges["finish"]>>) => void;
    const pending = new Promise<Awaited<ReturnType<RunChanges["finish"]>>>((resolve) => {
      complete = resolve;
    });
    const finish = vi.spyOn(RunChanges.prototype, "finish").mockReturnValueOnce(pending);
    const settlement = runtime.emit("agent_settled", {});

    try {
      await runtime.emit(event, {});
      complete([{ path: "file", status: "available", added: 1, removed: 0 }]);
      await settlement;
      expect(runtime.api.appendEntry).not.toHaveBeenCalled();
    } finally {
      complete([]);
      await settlement;
      finish.mockRestore();
    }
  }
);

it.each(["rpc", "json", "print"] as const)(
  "saves summaries in %s mode without touching the working UI",
  async (mode) => {
    const runtime = await fixture(mode);
    await runtime.emit("session_start", {});
    await runtime.emit("agent_start", {});
    await runtime.tool("write", { path: "file.txt", content: "new\n" });
    vi.advanceTimersByTime(1250);
    await runtime.emit("agent_settled", {});
    await runtime.emit("session_shutdown", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 1250,
      bashCalls: 0,
      files: [{ path: "file.txt", status: "available", added: 1, removed: 0 }]
    });
    expect(runtime.setWorkingMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);
