import { expect, it, vi } from "vite-plus/test";

import { summaryEntryType } from "./summary.ts";
import { fixture } from "./test-fixture.ts";

it("waits if another extension has already started a run during settlement", async () => {
  const runtime = fixture();
  await runtime.emit("session_start", {});
  await runtime.emit("agent_start", {});
  runtime.ctx.isIdle = () => false;
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).not.toHaveBeenCalled();
  runtime.ctx.isIdle = () => true;
  await runtime.emit("agent_settled", {});
  expect(runtime.api.appendEntry).toHaveBeenCalledExactlyOnceWith(
    summaryEntryType,
    expect.anything()
  );
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
    expect(vi.getTimerCount()).toBe(1);

    await runtime.emit(event, {});
    expect(vi.getTimerCount()).toBe(0);
    await runtime.emit("agent_start", {});
    await runtime.emit("agent_settled", {});
    // After shutdown, the late agent_start starts no run.
    expect(vi.mocked(runtime.api.appendEntry).mock.calls).toEqual(
      event === "session_shutdown"
        ? []
        : [[summaryEntryType, expect.objectContaining({ bashCalls: 0 })]]
    );
    expect(vi.getTimerCount()).toBe(0);
  }
);
