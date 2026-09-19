import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { afterEach, expect, expectTypeOf, it, vi } from "vite-plus/test";

import entry from "../index.ts";
import { loadTodoConfig } from "./config.ts";
import type { TodoExtensionAPI, TodoLifecycleContext } from "./index.ts";
import { shouldActivate } from "./runtime.ts";
import type { TodoWidgetFactory } from "./todo-overlay.ts";

vi.mock("./runtime.ts", () => ({ shouldActivate: vi.fn(() => true) }));
vi.mock("./config.ts", () => ({
  loadTodoConfig: vi.fn(() => ({ widgetCollapsed: false }))
}));

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("composes shared state across tool execution, replay, settings, and widget lifetime", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "todo-working-message-"));
  directories.push(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  expectTypeOf(entry).toExtend<ExtensionFactory>();
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
  expect(registerCommand.mock.calls.map(([name]) => name)).toEqual(["working-message", "todos"]);

  const dispatch = (name: string, event = { toolName: "", isError: false }) => {
    const callback = handlers.get(name);
    if (!callback) throw new Error(`Missing ${name} adapter`);
    for (const handler of callback) handler(event, ctx);
  };

  let branch: object[] = [];
  let widget: Component | undefined;
  const requestRender = vi.fn();
  const setWidget = vi.fn((_key: string, factory: TodoWidgetFactory | string[] | undefined) => {
    if (typeof factory !== "function") {
      widget = undefined;

      return;
    }

    widget = factory(
      { requestRender },
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
  const tool = registerTool.mock.calls[0]![0];
  await tool.execute("1", { action: "create", subject: "Live" });
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(widget?.render(80).join("\n")).toContain("Live");
  const initialRequests = requestRender.mock.calls.length;
  dispatch("tool_execution_end", { toolName: "bash", isError: false });
  dispatch("tool_execution_end", { toolName: "todo", isError: true });
  expect(requestRender).toHaveBeenCalledTimes(initialRequests);
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
  vi.mocked(loadTodoConfig).mockReturnValueOnce({ widgetCollapsed: true });
  dispatch("session_start");
  other.setText("Other status");
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(setWorkingMessage).toHaveBeenLastCalledWith("Other status · Working");
  expect(widget?.render(80)).toHaveLength(1);
  branch = [];
  dispatch("session_tree");
  expect(widget).toBeUndefined();
  expect(setWorkingMessage).toHaveBeenLastCalledWith("Other status");
  dispatch("session_shutdown");
  expect(setWorkingMessage).toHaveBeenLastCalledWith(undefined);
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(widget).toBeUndefined();
});

it("does not register anything outside the runtime activation boundary", () => {
  vi.mocked(shouldActivate).mockReturnValueOnce(false);
  const registerTool = vi.fn();
  entry({ registerTool, registerCommand: vi.fn(), events: createEventBus(), on() {} });
  expect(registerTool).not.toHaveBeenCalled();
});
