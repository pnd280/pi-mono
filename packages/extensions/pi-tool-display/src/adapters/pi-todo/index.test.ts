import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { piTodoAdapter, todoDisplayAdapter } from "./index.ts";

function result(details: unknown, text = "Done"): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function toolInfo(overrides: Partial<ToolInfo> = {}): ToolInfo {
  const base: ToolInfo = {
    name: "todo",
    description: "Manage tasks",
    parameters: { type: "object", properties: { action: { type: "string" } } },
    sourceInfo: {
      path: "/workspace/packages/extensions/pi-todo/src/index.ts",
      source: "local",
      scope: "user",
      origin: "package"
    }
  };

  return { ...base, ...overrides };
}

const textContext = {
  isError: false,
  isPartial: false,
  isCancelled: false,
  expanded: false
};

it("uses Todo-prefixed action verbs and ignores unknown arguments", () => {
  expect(todoDisplayAdapter.headingVerbs?.({ action: "create" })).toEqual({
    action: "Todo · Create",
    pending: "Todo · Creating",
    complete: "Todo · Created"
  });
  expect(todoDisplayAdapter.headingVerbs?.({ action: "clear" })?.complete).toBe("Todo · Cleared");
  expect(todoDisplayAdapter.headingVerbs?.({ action: "unknown" })).toBeUndefined();
  expect(todoDisplayAdapter.headingVerbs?.({})).toBeUndefined();
});

it("summarizes create arguments without serializing parameters", () => {
  expect(todoDisplayAdapter.invocation?.({ action: "create", subject: "Ship it" })).toEqual([
    { kind: "value", text: "Ship it" }
  ]);
  expect(
    todoDisplayAdapter.invocation?.({
      action: "create",
      subject: "Child",
      parentId: 2,
      blockedBy: [3, 4]
    })
  ).toEqual([
    { kind: "value", text: "Child" },
    { kind: "annotation", text: " under " },
    { kind: "value", text: "#2" },
    { kind: "annotation", text: " blocked by #3,#4" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "create" })).toEqual([
    { kind: "annotation", text: "…" }
  ]);
});

it("summarizes update changes and resolves the subject from a result", () => {
  expect(
    todoDisplayAdapter.invocation?.({ action: "update", id: 3, status: "in_progress" })
  ).toEqual([
    { kind: "value", text: "#3" },
    { kind: "annotation", text: " · status → in progress" }
  ]);
  expect(
    todoDisplayAdapter.invocation?.(
      { action: "update", id: 3, addBlockedBy: [1], removeBlockedBy: [2] },
      result({ tasks: [{ id: 3, subject: "Review", status: "pending" }] })
    )
  ).toEqual([
    { kind: "annotation", text: "#3 " },
    { kind: "value", text: "Review" },
    { kind: "annotation", text: " · blocked by +1 · blocked by -1" }
  ]);
  expect(
    todoDisplayAdapter.invocation?.({
      action: "update",
      id: 3,
      parentId: null,
      subject: "Renamed"
    })
  ).toEqual([
    { kind: "value", text: "#3" },
    { kind: "annotation", text: " · subject · detached" }
  ]);
});

it("summarizes list, get, delete, and clear arguments", () => {
  expect(todoDisplayAdapter.invocation?.({ action: "list" })).toEqual([
    { kind: "annotation", text: "all tasks" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "list", status: "pending" })).toEqual([
    { kind: "value", text: "pending" },
    { kind: "annotation", text: " tasks" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "list", includeDeleted: true })).toEqual([
    { kind: "annotation", text: "all tasks" },
    { kind: "annotation", text: " including deleted" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "get", id: 7 })).toEqual([
    { kind: "value", text: "#7" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "delete", id: 7 })).toEqual([
    { kind: "value", text: "#7" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "clear" })).toEqual([]);
  expect(todoDisplayAdapter.invocation?.("not an object")).toEqual([
    { kind: "annotation", text: "…" }
  ]);
});

it("reports a domain error as a failure outcome", () => {
  expect(todoDisplayAdapter.outcome?.(result({ error: "#9 not found" }))).toBe("failure");
  expect(todoDisplayAdapter.outcome?.(result({ tasks: [] }))).toBeUndefined();
  expect(todoDisplayAdapter.outcome?.(result({ error: "" }))).toBeUndefined();
});

it("adds a progress notice excluding failures and empty states", () => {
  const tasks = [
    { id: 1, subject: "One", status: "completed" },
    { id: 2, subject: "Two", status: "in_progress" },
    { id: 3, subject: "Three", status: "pending" }
  ];
  expect(todoDisplayAdapter.notices?.(result({ tasks }), false)).toEqual([
    { kind: "info", text: "1/3 completed · 1 in progress · 1 pending" }
  ]);
  expect(todoDisplayAdapter.notices?.(result({ tasks: [] }), false)).toEqual([]);
  expect(todoDisplayAdapter.notices?.(result({ tasks, error: "boom" }), false)).toEqual([]);
});

it("dims known status brackets while preserving result text", () => {
  const parts = todoDisplayAdapter.textParts?.(
    "[in_progress] #1 Ship it\n[pending] #2 Write notes",
    {},
    textContext
  );
  expect(parts).toEqual([
    { kind: "annotation", text: "[in_progress]" },
    { kind: "output", text: " #1 Ship it\n" },
    { kind: "annotation", text: "[pending]" },
    { kind: "output", text: " #2 Write notes" }
  ]);
  expect(parts?.map((part) => part.text).join("")).toBe(
    "[in_progress] #1 Ship it\n[pending] #2 Write notes"
  );
  expect(todoDisplayAdapter.textParts?.("Created #1: Ship it (pending)", {}, textContext)).toEqual([
    { kind: "output", text: "Created #1: Ship it (pending)" }
  ]);
  expect(
    todoDisplayAdapter.textParts?.("[pending] #1", {}, { ...textContext, isError: true })
  ).toEqual([{ kind: "error", text: "[pending] #1" }]);
});

it("provides a shared scope so adjacent calls share a group", () => {
  const pending = todoDisplayAdapter.exploration?.({ action: "create", subject: "Ship it" });
  const complete = todoDisplayAdapter.exploration?.(
    { action: "create", subject: "Ship it" },
    result({ tasks: [] })
  );
  expect(pending?.[0]?.label).toBe("Creating");
  expect(pending?.[0]?.parts).toEqual([{ kind: "value", text: "Ship it" }]);
  expect(pending?.[0]?.scope).toBeDefined();
  expect(complete?.[0]?.label).toBe("Created");
  expect(complete?.[0]?.scope).toEqual(pending?.[0]?.scope);
  expect(todoDisplayAdapter.exploration?.("not an object")).toBeUndefined();
});

it("resolves only the verified todo tool registration", () => {
  expect(piTodoAdapter(toolInfo())?.id).toBe("pi-todo:todo");
  expect(piTodoAdapter(toolInfo({ name: "other" }))).toBeUndefined();
  expect(piTodoAdapter(undefined)).toBeUndefined();
  expect(
    piTodoAdapter(
      toolInfo({
        sourceInfo: {
          path: "/workspace/node_modules/other/index.ts",
          source: "npm:other",
          scope: "user",
          origin: "package"
        }
      })
    )
  ).toBeUndefined();
  expect(
    piTodoAdapter(
      toolInfo({ parameters: { type: "object", properties: { action: { type: "number" } } } })
    )
  ).toBeUndefined();
  expect(
    piTodoAdapter(toolInfo({ sourceInfo: { ...toolInfo().sourceInfo, source: "builtin" } }))
  ).toBeUndefined();
});
