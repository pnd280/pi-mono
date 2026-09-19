import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, vi } from "vite-plus/test";

import entry from "../index.ts";
import type { SummaryContext, SummaryEvents, SummaryExtensionAPI } from "./index.ts";

type TestEvents = SummaryEvents & {
  turn_end: unknown;
  agent_end: unknown;
  user_bash: unknown;
};

const directories: string[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

export function fixture(mode: SummaryContext["mode"] = "tui") {
  const directory = mkdtempSync(join(tmpdir(), "pi-agent-summary-"));
  directories.push(directory);
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  const session = SessionManager.inMemory(directory);
  const handlers: {
    [E in keyof TestEvents]: ((
      event: TestEvents[E],
      ctx: SummaryContext
    ) => void | Promise<void>)[];
  } = {
    session_start: [],
    session_shutdown: [],
    agent_start: [],
    agent_settled: [],
    tool_execution_start: [],
    tool_call: [],
    tool_result: [],
    turn_end: [],
    agent_end: [],
    user_bash: []
  };
  const setWorkingMessage = vi.fn();
  const ctx: SummaryContext = {
    cwd: directory,
    mode,
    isIdle: () => true,
    isProjectTrusted: () => false,
    ui: { setWorkingMessage, notify: vi.fn() }
  };

  const on = <E extends keyof TestEvents>(
    name: E,
    handler: (event: TestEvents[E], ctx: SummaryContext) => void | Promise<void>
  ) => {
    const current = handlers[name];
    current.push(handler);
  };

  const api: SummaryExtensionAPI = {
    events: createEventBus(),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    appendEntry: vi.fn((customType: string, data: unknown) => {
      session.appendCustomEntry(customType, data);
    }),
    on
  };
  entry(api);
  let nextId = 0;

  const emit = async <E extends keyof TestEvents>(
    name: E,
    event: TestEvents[E] & Record<string, unknown>
  ) => {
    for (const handler of handlers[name]) await handler(event, ctx);
  };

  const tool = async (toolName: string, input: Record<string, unknown>, action = () => {}) => {
    const toolCallId = String(nextId++);
    await emit("tool_execution_start", {
      type: "tool_execution_start",
      toolName,
      toolCallId,
      args: input
    });
    await emit("tool_call", { type: "tool_call", toolName, toolCallId, input });
    action();
    await emit("tool_result", { type: "tool_result", toolName, toolCallId });
  };

  return { api, ctx, session, setWorkingMessage, emit, tool };
}
