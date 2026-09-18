import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { expect, expectTypeOf, it, vi } from "vite-plus/test";

import entry from "../index.ts";
import { loadTodoConfig } from "./config.ts";
import type { TodoExtensionAPI, TodoLifecycleContext } from "./index.ts";
import { shouldActivate } from "./runtime.ts";
import type { TodoWidgetFactory } from "./todo-overlay.ts";

vi.mock("./runtime.ts", () => ({ shouldActivate: vi.fn(() => true) }));
vi.mock("./config.ts", () => ({
  loadTodoConfig: vi.fn(() => ({ widgetCollapsed: false }))
}));

it("composes shared state across tool execution, replay, settings, and widget lifetime", async () => {
  expectTypeOf(entry).toExtend<ExtensionFactory>();
  const registerTool = vi.fn<TodoExtensionAPI["registerTool"]>();
  const registerCommand = vi.fn<TodoExtensionAPI["registerCommand"]>();
  const handlers = new Map<
    string,
    (event: { toolName: string; isError: boolean }, ctx: TodoLifecycleContext) => void
  >();

  const on: TodoExtensionAPI["on"] = (name, handler) => {
    handlers.set(name, handler);
  };

  entry({ registerTool, registerCommand, on });
  expect(registerCommand.mock.calls[0]?.[0]).toBe("todos");

  const dispatch = (name: string, event = { toolName: "", isError: false }) => {
    const callback = handlers.get(name);
    if (!callback) throw new Error(`Missing ${name} adapter`);
    callback(event, ctx);
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
    ui: { setWidget, setWorkingMessage, addAutocompleteProvider: vi.fn() }
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
  expect(setWorkingMessage).toHaveBeenLastCalledWith("Working");
  expect(widget?.render(80)).toHaveLength(1);
  branch = [];
  dispatch("session_tree");
  expect(widget).toBeUndefined();
  dispatch("session_shutdown");
  dispatch("tool_execution_end", { toolName: "todo", isError: false });
  expect(widget).toBeUndefined();
});

it("does not register anything outside the runtime activation boundary", () => {
  vi.mocked(shouldActivate).mockReturnValueOnce(false);
  const registerTool = vi.fn();
  entry({ registerTool, registerCommand: vi.fn(), on() {} });
  expect(registerTool).not.toHaveBeenCalled();
});
