import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fauxAssistantMessage, type AssistantMessage } from "@earendil-works/pi-ai";
import { DefaultResourceLoader, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { expect, it, onTestFinished, vi } from "vite-plus/test";

import { RunChanges } from "./changes.ts";
import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

it("saves synthetic lifecycle summaries without native resource or model startup", async () => {
  const unavailable = new Error("Native runtime startup is unavailable");
  const reload = vi.spyOn(DefaultResourceLoader.prototype, "reload").mockRejectedValue(unavailable);
  const create = vi.spyOn(ModelRuntime, "create").mockRejectedValue(unavailable);

  try {
    const runtime = fixture();
    await runtime.emit("agent_start", {});
    vi.advanceTimersByTime(1250);
    await runtime.emit("agent_settled", {});
    expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
      durationMs: 1250,
      finishedAt: Date.now(),
      bashCalls: 0,
      files: []
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    reload.mockRestore();
    create.mockRestore();
  }
});

it.each(["resources", "models"] as const)(
  "cleans up when lazy native %s startup fails",
  async (startup) => {
    const unavailable = new Error("Native runtime startup is unavailable");
    const start =
      startup === "resources"
        ? vi.spyOn(DefaultResourceLoader.prototype, "reload")
        : vi.spyOn(ModelRuntime, "create");
    start.mockRejectedValue(unavailable);

    try {
      const runtime = fixture();
      onTestFinished(() => {
        expect(existsSync(runtime.ctx.cwd)).toBe(false);
        expect(runtime.api.appendEntry).not.toHaveBeenCalled();
        expect(runtime.setWorkingMessage).toHaveBeenLastCalledWith(undefined);
      });
      await runtime.emit("session_start", {});
      await runtime.emit("agent_start", {});
      await expect(runtime.tool("write", { path: "file.txt", content: "new\n" })).rejects.toBe(
        unavailable
      );
    } finally {
      start.mockRestore();
    }
  }
);

it("records one context-free entry after all turns and retries settle, preserving other working text", async () => {
  const runtime = fixture();
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
  const workingText: unknown = runtime.setWorkingMessage.mock.lastCall?.[0];
  expect(workingText).toContain("Checking files");
  expect(workingText).toContain("2s");
  await runtime.emit("turn_end", {});
  await runtime.emit("agent_end", {});
  vi.advanceTimersByTime(1000);
  await runtime.emit("agent_start", {});
  await runtime.tool("bash", { command: "false" });
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
    const runtime = fixture(mode);
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
      models: [{ provider: "faux", id: "faux-1" }],
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
      models: [{ provider: "faux", id: "faux-1" }],
      bashCalls: 0,
      files: []
    });
  }
);

it.each(["session_start", "session_shutdown"] as const)(
  "discards throughput on %s",
  async (event) => {
    const runtime = fixture();
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
      models: [{ provider: "faux", id: "faux-1" }],
      bashCalls: 0,
      files: []
    });
  }
);

it("records each model that answered, in order of first use, rather than the selection", async () => {
  const runtime = fixture();
  const answer = (
    provider: string,
    model: string,
    thinkingLevel: AssistantMessage["thinkingLevel"],
    stopReason: AssistantMessage["stopReason"] = "stop",
    api = "faux"
  ) =>
    runtime.emit("message_end", {
      type: "message_end",
      message: {
        ...assistantMessage(10, stopReason),
        api,
        provider,
        model,
        ...(thinkingLevel && { thinkingLevel })
      }
    });
  await runtime.emit("agent_start", {});
  await answer("router", "auto", "high", "aborted", "pi-virtual");
  await answer("openai", "failed", "high", "error");
  await answer("openai", "strong", "high", "toolUse");
  await runtime.emit("agent_start", {});
  await answer("openai", "cheap", "medium", "toolUse");
  await answer("openai", "interrupted", "high", "aborted");
  await answer("openai", "strong", "low");
  await answer("openai", "unmanaged", undefined);
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    models: [
      { provider: "openai", id: "strong", thinkingLevel: "high" },
      { provider: "openai", id: "cheap", thinkingLevel: "medium" },
      { provider: "openai", id: "interrupted", thinkingLevel: "high" },
      { provider: "openai", id: "strong", thinkingLevel: "low" },
      { provider: "openai", id: "unmanaged" }
    ],
    bashCalls: 0,
    files: []
  });

  await runtime.emit("agent_start", {});
  await answer("openai", "failed", "high", "error");
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenLastCalledWith(summaryEntryType, {
    durationMs: 0,
    finishedAt: Date.now(),
    bashCalls: 0,
    files: []
  });
});

it("aggregates native edit/write aliases and large files without scanning bash-only changes", async () => {
  const runtime = fixture();
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
  const runtime = fixture();
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

it("cleans up unfinished runs on shutdown without appending a partial summary", async () => {
  const runtime = fixture();
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

it.each(["session_start", "session_shutdown"] as const)(
  "ignores native completion captured before %s, including after another run starts",
  async (event) => {
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
      expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
        durationMs: 0,
        finishedAt: Date.now(),
        bashCalls: 0,
        files: []
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      observer.dispose();
    }
  }
);

it("captures the finish time before awaiting file statistics", async () => {
  const runtime = fixture();
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
  } finally {
    finish.mockRestore();
  }
});

it.each(["session_shutdown", "session_start"] as const)(
  "discards a pending net comparison after %s",
  async (event) => {
    const runtime = fixture();
    await runtime.emit("agent_start", {});
    const pending = Promise.withResolvers<Awaited<ReturnType<RunChanges["finish"]>>>();
    const finish = vi.spyOn(RunChanges.prototype, "finish").mockReturnValueOnce(pending.promise);
    const settlement = runtime.emit("agent_settled", {});

    try {
      await runtime.emit(event, {});
      pending.resolve([{ path: "file", status: "available", added: 1, removed: 0 }]);
      await settlement;
      expect(runtime.api.appendEntry).not.toHaveBeenCalled();
    } finally {
      pending.resolve([]);
      await settlement;
      finish.mockRestore();
    }
  }
);

it("saves summaries outside TUI mode without touching the working UI", async () => {
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
