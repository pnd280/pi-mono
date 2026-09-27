import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider, type AssistantMessage } from "@earendil-works/pi-ai";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { expect, it, vi } from "vite-plus/test";

import { RunChanges } from "./changes.ts";
import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

it("records one context-free entry after all turns and retries settle, preserving other working text", async () => {
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
    finishedAt: Date.now(),
    bashCalls: 2,
    files: []
  });
  expect(runtime.session.buildSessionContext().messages).toEqual(before);
  expect(runtime.setWorkingMessage).toHaveBeenLastCalledWith("Checking files");
  expect(vi.getTimerCount()).toBe(0);
  runtime.setWorkingMessage.mockClear();
  vi.advanceTimersByTime(5000);
  expect(runtime.setWorkingMessage).not.toHaveBeenCalled();
  await runtime.emit("session_shutdown", {});
});

function assistantMessage(
  output: number,
  stopReason: AssistantMessage["stopReason"]
): AssistantMessage {
  return {
    ...fauxAssistantMessage([], { stopReason }),
    usage: {
      input: 1000,
      output,
      reasoning: output / 2,
      cacheRead: 500,
      cacheWrite: 0,
      totalTokens: 1500 + output,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  };
}

it.each([
  ["tui", "stop"],
  ["rpc", "aborted"],
  ["json", "error"],
  ["print", "stop"]
] as const)(
  "saves throughput across continuations in %s mode ending with %s",
  async (mode, stopReason) => {
    const runtime = await fixture(mode);
    const start = () =>
      runtime.emit("message_start", {
        type: "message_start",
        message: assistantMessage(0, "pending")
      });
    const end = (output: number, reason: AssistantMessage["stopReason"]) =>
      runtime.emit("message_end", {
        type: "message_end",
        message: assistantMessage(output, reason)
      });
    await start();
    vi.advanceTimersByTime(1000);
    await end(500, "stop");
    await runtime.emit("agent_start", {});
    await start();
    vi.advanceTimersByTime(250);
    const toolResult = {
      role: "toolResult" as const,
      toolCallId: "nested",
      toolName: "nested",
      content: [],
      isError: false,
      usage: assistantMessage(500, "stop").usage,
      timestamp: Date.now()
    };
    await runtime.emit("message_start", { type: "message_start", message: toolResult });
    await runtime.emit("message_end", { type: "message_end", message: toolResult });
    vi.advanceTimersByTime(750);
    await end(80, "toolUse");
    await runtime.emit("agent_end", {});
    vi.advanceTimersByTime(10_000);
    await runtime.emit("agent_start", {});
    await start();
    vi.advanceTimersByTime(3000);
    await end(40, stopReason);
    await start();
    vi.advanceTimersByTime(5000);
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 19_000,
      finishedAt: Date.now(),
      throughput: { outputTokens: 120, durationMs: 4000 },
      bashCalls: 0,
      files: []
    });
    expect(runtime.session.buildSessionContext().messages).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    if (mode !== "tui") expect(runtime.setWorkingMessage).not.toHaveBeenCalled();

    await runtime.emit("agent_start", {});
    await end(40, "stop");
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
      durationMs: 0,
      finishedAt: Date.now(),
      bashCalls: 0,
      files: []
    });
  }
);

it.each(["session_start", "session_shutdown"] as const)(
  "discards throughput on %s",
  async (event) => {
    const runtime = await fixture();
    await runtime.emit("agent_start", {});
    const start = { type: "message_start" as const, message: assistantMessage(0, "pending") };
    const end = { type: "message_end" as const, message: assistantMessage(50, "stop") };
    await runtime.emit("message_start", start);
    vi.advanceTimersByTime(1000);
    await runtime.emit("message_end", end);
    await runtime.emit("message_start", start);
    vi.advanceTimersByTime(1000);
    await runtime.emit(event, {});
    await runtime.emit("agent_start", {});
    await runtime.emit("message_end", end);
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 0,
      finishedAt: Date.now(),
      bashCalls: 0,
      files: []
    });
  }
);

it("records the provider, model, and thinking level selected when the run began", async () => {
  const runtime = await fixture();
  runtime.ctx.model = fauxProvider({
    provider: "anthropic",
    models: [{ id: "claude-opus-5-5", reasoning: true }]
  }).getModel("claude-opus-5-5");
  vi.mocked(runtime.api.getThinkingLevel).mockReturnValue("medium");
  await runtime.emit("agent_start", {});
  runtime.ctx.model = fauxProvider({
    provider: "other-provider",
    models: [{ id: "other-model", reasoning: true }]
  }).getModel("other-model");
  vi.mocked(runtime.api.getThinkingLevel).mockReturnValue("high");
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    model: { provider: "anthropic", id: "claude-opus-5-5", thinkingLevel: "medium" },
    bashCalls: 0,
    files: []
  });

  runtime.ctx.model = undefined;
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: []
  });
});

it("leaves an initially missing model absent until the next run", async () => {
  const runtime = await fixture();
  await runtime.emit("agent_start", {});
  runtime.ctx.model = fauxProvider({
    provider: "later-provider",
    models: [{ id: "later-model", reasoning: true }]
  }).getModel("later-model");
  vi.mocked(runtime.api.getThinkingLevel).mockReturnValue("high");
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: []
  });

  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    model: { provider: "later-provider", id: "later-model", thinkingLevel: "high" },
    bashCalls: 0,
    files: []
  });
});

it("aggregates native edit/write aliases and large files without scanning bash-only changes", async () => {
  const runtime = await fixture();
  const path = join(runtime.ctx.cwd, "existing.txt");
  const unchanged = "unchanged content\n".repeat(6000);
  writeFileSync(path, `original\nkeep\n${unchanged}`);
  symlinkSync(path, join(runtime.ctx.cwd, "alias.txt"));
  await runtime.emit("agent_start", {});
  await runtime.tool("edit", {
    path: "alias.txt",
    edits: [{ oldText: "original", newText: "intermediate\nfrom-edit" }]
  });
  await runtime.tool("write", { path, content: `final\nfrom-edit\nkeep\nextra\n${unchanged}` });
  await runtime.tool("write", { path: "@./new.txt", content: "new\n" });
  await runtime.tool("bash", { command: "generate files" }, () => {
    writeFileSync(join(runtime.ctx.cwd, "shell-only.txt"), "not counted\n");
    writeFileSync(path, "later shell change, not counted\n");
  });
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    bashCalls: 1,
    files: [
      { path: "existing.txt", status: "available", added: 3, removed: 1 },
      { path: "new.txt", status: "available", added: 1, removed: 0 }
    ]
  });
  vi.advanceTimersByTime(1000);
  await runtime.emit("agent_start", {});
  vi.advanceTimersByTime(250);
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
    durationMs: 250,
    finishedAt: Date.now(),
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
    finishedAt: Date.now(),
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
    finishedAt: Date.now(),
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
  runtime.setWorkingMessage.mockClear();
  vi.advanceTimersByTime(5000);
  expect(runtime.api.appendEntry).not.toHaveBeenCalled();
  expect(runtime.setWorkingMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: []
  });
});

it("captures the finish time before awaiting file statistics", async () => {
  const runtime = await fixture();
  await runtime.emit("agent_start", {});
  vi.advanceTimersByTime(1250);
  const finishedAt = Date.now();
  const finish = vi.spyOn(RunChanges.prototype, "finish").mockImplementationOnce(async () => {
    vi.advanceTimersByTime(5000);

    return [];
  });

  try {
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 1250,
      finishedAt,
      bashCalls: 0,
      files: []
    });
    expect(runtime.session.getLeafEntry()?.timestamp).toBe(
      new Date(finishedAt + 5000).toISOString()
    );
  } finally {
    finish.mockRestore();
  }
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

it("saves summaries outside TUI mode without touching the working UI", async () => {
  const runtime = await fixture("rpc");
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
