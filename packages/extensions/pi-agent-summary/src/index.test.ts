import { expect, it, vi } from "vite-plus/test";

import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

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
    bashCalls: 0
  });
});

it.each(["session_start", "session_shutdown"] as const)(
  "discards the active run and stops its timer on %s",
  async (event) => {
    const runtime = fixture();
    await runtime.emit("session_start", {});
    await runtime.emit("agent_start", {});
    await runtime.emit("tool_execution_start", {
      type: "tool_execution_start",
      toolName: "bash",
      toolCallId: "before-reset",
      args: {}
    });
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(1);

    await runtime.emit(event, {});
    expect(vi.getTimerCount()).toBe(0);
    await runtime.emit("agent_start", {});
    await runtime.emit("agent_settled", {});
    // After shutdown, the late agent_start starts no run.
    expect(vi.mocked(runtime.api.appendEntry).mock.calls).toEqual(
      event === "session_shutdown"
        ? []
        : [[summaryEntryType, { durationMs: 0, finishedAt: Date.now(), bashCalls: 0 }]]
    );
    expect(vi.getTimerCount()).toBe(0);
  }
);

it("saves summaries outside TUI mode without touching the working UI", async () => {
  const runtime = fixture("rpc");
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  vi.advanceTimersByTime(1250);
  expect(vi.getTimerCount()).toBe(0);
  await runtime.emit("agent_settled", {});
  await runtime.emit("session_shutdown", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(summaryEntryType, {
    durationMs: 1250,
    finishedAt: Date.now(),
    bashCalls: 0
  });
  expect(runtime.setWorkingMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
