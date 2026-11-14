import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, vi } from "vite-plus/test";

import entry from "../index.ts";
import type { SummaryContext, SummaryEvents, SummaryExtensionAPI } from "./index.ts";

const cleanup: (() => Promise<void>)[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] }));
afterEach(async () => {
  try {
    for (const dispose of cleanup.splice(0)) await dispose();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pi-agent-summary-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  const handlers: {
    [E in keyof SummaryEvents]: ((
      event: SummaryEvents[E],
      ctx: SummaryContext
    ) => void | Promise<void>)[];
  } = {
    session_start: [],
    session_shutdown: [],
    agent_start: [],
    agent_settled: [],
    message_start: [],
    message_update: [],
    message_end: [],
    tool_execution_start: []
  };
  const ctx: SummaryContext = {
    cwd: directory,
    mode: "tui",
    isIdle: () => true,
    isProjectTrusted: () => false,
    ui: { setWorkingMessage: vi.fn(), notify: vi.fn() }
  };
  const api: SummaryExtensionAPI = {
    events: createEventBus(),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    appendEntry: vi.fn(),
    on: (name, handler) => {
      handlers[name].push(handler);
    }
  };

  const emit = async <E extends keyof SummaryEvents>(
    name: E,
    event: SummaryEvents[E] & Record<string, unknown>
  ) => {
    for (const handler of handlers[name]) await handler(event, ctx);
  };

  cleanup.push(async () => {
    try {
      await emit("session_shutdown", {});
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  // The lifecycle coordinator registers only the fixture's events through `on`, and the extension claims no shortcut.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  entry(api as Parameters<typeof entry>[0]);

  return { api, ctx, emit };
}
