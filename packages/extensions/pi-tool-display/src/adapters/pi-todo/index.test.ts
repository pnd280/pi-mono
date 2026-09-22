import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { piTodoAdapter, todoDisplayAdapter } from "./index.ts";

function result(details: unknown, text = "Done"): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function toolInfo(overrides: Partial<ToolInfo> = {}): ToolInfo {
  const base: ToolInfo = {
    name: "todo",
    description: "Manage todos",
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
  result: result(undefined),
  contentIndex: 0,
  isError: false,
  isPartial: false,
  isCancelled: false,
  expanded: false
};

it("uses Todos-prefixed action verbs and ignores unknown arguments", () => {
  expect(todoDisplayAdapter.headingVerbs?.({ action: "create" })).toEqual({
    action: "Todos · Create",
    pending: "Todos · Creating",
    complete: "Todos · Created"
  });
  expect(todoDisplayAdapter.headingVerbs?.({ action: "clear" })?.complete).toBe("Todos · Cleared");
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
    { kind: "annotation", text: "all todos" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "list", status: "pending" })).toEqual([
    { kind: "value", text: "pending" },
    { kind: "annotation", text: " todos" }
  ]);
  expect(todoDisplayAdapter.invocation?.({ action: "list", includeDeleted: true })).toEqual([
    { kind: "annotation", text: "all todos" },
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

it("summarizes progress and empty states without inferring missing snapshots", () => {
  const tasks = [
    { id: 1, subject: "One", status: "completed" },
    { id: 2, subject: "Two", status: "in_progress" },
    { id: 3, subject: "Three", status: "pending" }
  ];
  const context = {
    args: { action: "list" },
    outcome: "success" as const,
    operation: undefined,
    expanded: false
  };
  expect(todoDisplayAdapter.summary?.(result({ tasks }), context)).toEqual({
    text: "1/3 completed · 1 in progress · 1 pending"
  });
  expect(todoDisplayAdapter.summary?.(result({ tasks: [] }), context)).toEqual({
    text: "No todos"
  });
  expect(todoDisplayAdapter.summary?.(result({}), context)).toBeUndefined();
  expect(todoDisplayAdapter.summary?.(result({ tasks, error: "boom" }), context)).toBeUndefined();
  expect(
    todoDisplayAdapter.summary?.(result({ tasks }), { ...context, outcome: "failure" })
  ).toBeUndefined();
});

it("uses confirmed todo state, create IDs, and filtered list totals", () => {
  const tasks = [
    { id: 4, subject: "Review", status: "completed" },
    { id: 5, subject: "Ship", status: "pending" },
    { id: 6, subject: "Removed", status: "deleted" }
  ];
  const summarize = (args: unknown) =>
    todoDisplayAdapter.summary?.(result({ tasks, nextId: 6 }), {
      args,
      outcome: "success",
      operation: undefined,
      expanded: false
    })?.text;
  expect(summarize({ action: "create", subject: "Ship" })).toBe(
    "#5 pending · 1/2 completed · 1 pending"
  );
  expect(summarize({ action: "update", id: 5, status: "completed" })).toBe(
    "#5 pending · 1/2 completed · 1 pending"
  );
  expect(summarize({ action: "get", id: 4 })).toBe("#4 completed · 1/2 completed · 1 pending");
  expect(summarize({ action: "delete", id: 6 })).toBe("#6 deleted · 1/2 completed · 1 pending");
  expect(summarize({ action: "list", status: "in_progress" })).toBe(
    "0 todos listed · 1/2 completed · 1 pending"
  );
  expect(summarize({ action: "list", includeDeleted: true })).toBe(
    "3 todos listed · 1/2 completed · 1 pending"
  );
});

it("uses friendly todo labels while retaining error text", () => {
  const parts = todoDisplayAdapter.textParts?.(
    "[in_progress] #1 Ship it\n[pending] #2 Write notes",
    {},
    textContext
  );
  expect(parts).toEqual([
    { kind: "annotation", text: "[in progress]" },
    { kind: "output", text: " #1 Ship it\n" },
    { kind: "annotation", text: "[pending]" },
    { kind: "output", text: " #2 Write notes" }
  ]);
  expect(
    todoDisplayAdapter.textParts!(
      "#1 [in_progress] Review\n  inProgressLabel: inspect\n  blockedBy: #2",
      {},
      textContext
    )
      .map((part) => part.text)
      .join("")
  ).toBe("#1 [in progress] Review\n  Activity: inspect\n  Blocked by: #2");
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
  expect(pending?.[0]?.parts).toEqual([{ kind: "value", text: "Ship it" }]);
  expect(pending?.[0]?.scope).toBeDefined();
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
