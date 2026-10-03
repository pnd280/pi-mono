import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { afterEach, expect, it, vi } from "vite-plus/test";

import entry from "../index.ts";
import { loadTodoConfig } from "./config.ts";
import type { TodoExtensionAPI, TodoLifecycleContext } from "./index.ts";
import type { TodoWidgetFactory } from "./todo-overlay.ts";

vi.mock("./runtime.ts", () => ({ shouldActivate: vi.fn(() => true) }));
vi.mock("./config.ts", () => ({
  loadTodoConfig: vi.fn(() => ({ collapseWidgetByDefault: false }))
}));

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("replays branch state and clears todo activity without clearing other contributions", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "todo-working-message-"));
  directories.push(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const registerTool = vi.fn<TodoExtensionAPI["registerTool"]>();
  const registerCommand = vi.fn<TodoExtensionAPI["registerCommand"]>();
  const handlers = new Map<
    string,
    ((event: { toolName: string; isError: boolean }, ctx: TodoLifecycleContext) => void)[]
  >();

  const on: TodoExtensionAPI["on"] = (name, handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  };

  const api = { registerTool, registerCommand, on, events: createEventBus() };
  const other = registerWorkingMessage(api, {
    id: "other.status",
    label: "Other",
    contributor: "other"
  });
  entry(api);

  const dispatch = (name: string, event = { toolName: "", isError: false }) => {
    const callback = handlers.get(name);
    if (!callback) throw new Error(`Missing ${name} adapter`);
    for (const handler of callback) handler(event, ctx);
  };

  let branch: object[] = [];
  let widget: Component | undefined;
  const setWidget = vi.fn((_key: string, factory: TodoWidgetFactory | string[] | undefined) => {
    if (typeof factory !== "function") {
      widget = undefined;

      return;
    }

    widget = factory(
      { mode: "fullscreen", requestRender() {} },
      { fg: (_color, text) => text, strikethrough: (text) => text }
    );
  });
  const setWorkingMessage = vi.fn();
  const ctx: TodoLifecycleContext = {
    cwd: "/project",
    mode: "tui",
    isProjectTrusted: () => false,
    sessionManager: { getBranch: () => branch },
    ui: { setWidget, setWorkingMessage, notify: vi.fn(), addAutocompleteProvider: vi.fn() }
  };
  dispatch("session_start");
  const tool = registerTool.mock.calls.find(([definition]) => definition.name === "todo")?.[0];
  if (!tool) throw new Error("Todo tool was not registered");
  await tool.execute("1", { action: "create", subject: "Live" });
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(widget?.render(80).join("\n")).toContain("Live");
  branch = [
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "todo",
        details: {
          version: 2,
          tasks: [
            { id: 1, subject: "Restored", status: "in_progress", inProgressLabel: "Working" }
          ],
          nextId: 2
        }
      }
    }
  ];
  dispatch("session_compact");
  expect(widget?.render(80).join("\n")).toContain("Restored");
  vi.mocked(loadTodoConfig).mockReturnValueOnce({ collapseWidgetByDefault: true });
  dispatch("session_start");
  other.setText("Other status");
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Other status");
  expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Working");
  branch = [];
  dispatch("session_tree");
  expect(widget).toBeUndefined();
  expect(setWorkingMessage).toHaveBeenLastCalledWith("Other status");
  dispatch("session_shutdown");
  expect(setWorkingMessage).toHaveBeenLastCalledWith(undefined);
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(widget).toBeUndefined();
});
