import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAgentSession,
  createEventBus,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, vi } from "vite-plus/test";

import entry from "../index.ts";
import type { SummaryContext, SummaryEvents, SummaryExtensionAPI } from "./index.ts";

type TestEvents = SummaryEvents & {
  turn_end: unknown;
  agent_end: unknown;
};

const cleanup: (() => Promise<void>)[] = [];
beforeEach(() =>
  vi.useFakeTimers({
    toFake: ["Date", "setInterval", "clearInterval", "performance"],
    now: new Date("2026-01-01T14:34:56.000Z")
  })
);
afterEach(async () => {
  try {
    for (const dispose of cleanup.splice(0)) await dispose();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

export function fixture(mode: SummaryContext["mode"] = "tui") {
  const directory = mkdtempSync(join(tmpdir(), "pi-agent-summary-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  vi.stubEnv("PI_OFFLINE", "1");
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
    message_start: [],
    message_end: [],
    tool_execution_start: [],
    turn_end: [],
    agent_end: []
  };
  const setWorkingMessage = vi.fn();
  const ctx: SummaryContext = {
    cwd: directory,
    mode,
    sessionManager: session,
    isIdle: () => true,
    isProjectTrusted: () => false,
    ui: { setWorkingMessage, notify: vi.fn() }
  };
  const api: SummaryExtensionAPI = {
    events: createEventBus(),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    appendEntry: vi.fn((customType: string, data: unknown) =>
      session.appendCustomEntry(customType, data)
    ),
    on: (name, handler) => {
      handlers[name].push(handler);
    }
  };

  const emit = async <E extends keyof TestEvents>(
    name: E,
    event: TestEvents[E] & Record<string, unknown>
  ) => {
    for (const handler of handlers[name]) await handler(event, ctx);
  };

  let nativeSession: Promise<AgentSession> | undefined;
  cleanup.push(async () => {
    try {
      await emit("session_shutdown", {});
    } finally {
      try {
        const agentSession = await nativeSession?.catch(() => undefined);
        agentSession?.dispose();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });
  // Observation must be installed before the first native session is constructed.
  entry(api);
  const native = () =>
    (nativeSession ??= (async () => {
      const settingsManager = SettingsManager.inMemory();
      const resourceLoader = new DefaultResourceLoader({
        cwd: directory,
        agentDir: directory,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true
      });
      await resourceLoader.reload();
      const modelRuntime = await ModelRuntime.create({
        authPath: join(directory, "auth.json"),
        modelsPath: null,
        modelsStorePath: join(directory, "models-store.json"),
        refreshOnCreate: false,
        allowModelNetwork: false
      });
      const { session: agentSession } = await createAgentSession({
        cwd: directory,
        agentDir: directory,
        settingsManager,
        resourceLoader,
        modelRuntime,
        sessionManager: session
      });

      return agentSession;
    })());
  let nextId = 0;

  const tool = async (toolName: string, input: Record<string, unknown>) => {
    const toolCallId = String(nextId++);
    await emit("tool_execution_start", {
      type: "tool_execution_start",
      toolName,
      toolCallId,
      args: input
    });

    const agentSession = await native();
    const tool = agentSession.agent.state.tools.find((tool) => tool.name === toolName);
    if (!tool) throw new Error(`Missing tool ${toolName}`);

    return tool.execute(toolCallId, input);
  };

  return { api, ctx, session, setWorkingMessage, emit, tool };
}
