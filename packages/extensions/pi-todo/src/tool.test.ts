import { fauxToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import { expect, it } from "vite-plus/test";

import { MAX_METADATA_BYTES, MAX_METADATA_DEPTH } from "./constants.ts";
import { TodoController } from "./controller.ts";
import { parseTodoStateSnapshot } from "./session-state.ts";
import { createTodoTool } from "./tool.ts";

it("projects model-facing parameters without weakening the todo input shape", () => {
  const tool = createTodoTool(new TodoController());
  const serialized = JSON.stringify(tool.parameters);
  for (const keyword of ["~standard", "minimum", "maximum"])
    expect(serialized).not.toContain(`"${keyword}"`);

  expect(JSON.parse(serialized)).toMatchObject({
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { type: "string", enum: ["create", "update", "list", "get", "delete", "clear"] },
      subject: { type: "string", maxLength: 200 },
      description: { type: "string", maxLength: 4000 },
      inProgressLabel: { type: "string", maxLength: 200 },
      status: { type: "string", enum: ["pending", "in_progress", "completed", "deleted"] },
      parentId: { type: ["integer", "null"] },
      blockedBy: { type: "array", maxItems: 100, items: { type: "number" } },
      addBlockedBy: { type: "array", maxItems: 100, items: { type: "number" } },
      removeBlockedBy: { type: "array", maxItems: 100, items: { type: "number" } },
      owner: { type: "string", maxLength: 200 },
      metadata: { type: "object", additionalProperties: {} },
      id: { type: "number" },
      includeDeleted: { type: "boolean" }
    }
  });

  for (const parentId of [undefined, null, 1]) {
    const args = {
      action: "create",
      subject: "Child",
      ...(parentId === undefined ? {} : { parentId }),
      metadata: { note: "value" }
    };
    expect(validateToolArguments(tool, fauxToolCall("todo", args))).toEqual(args);
  }

  for (const args of [
    {},
    { action: "unknown" },
    { action: "create", parentId: 1.5 },
    { action: "create", subject: {} },
    { action: "create", subject: "x".repeat(201) },
    { action: "create", blockedBy: Array.from({ length: 101 }, () => 1) },
    { action: "create", extra: true }
  ])
    expect(() => {
      validateToolArguments(tool, fauxToolCall("todo", args));
    }).toThrow();
});

it("rejects out-of-range parent IDs without mutating state after schema projection", async () => {
  const controller = new TodoController();
  const tool = createTodoTool(controller);
  await tool.execute("create", { action: "create", subject: "Root" });
  const before = controller.getState();

  for (const parentId of [0, Number.MAX_SAFE_INTEGER + 1]) {
    for (const action of ["create", "update"] as const) {
      const result = await tool.execute("invalid", { action, id: 1, subject: "Changed", parentId });
      expect(result.details.error).toContain("parentId: invalid todo id");
      expect(result.details.tasks).toEqual(before.tasks);
      expect(controller.getState()).toEqual(before);
    }
  }
});

it("returns complete snapshots for successful calls and domain errors", async () => {
  const tool = createTodoTool(new TodoController());
  const created = await tool.execute("1", {
    action: "create",
    subject: "Root",
    metadata: { phase: "scout" }
  });
  const child = await tool.execute("2", { action: "create", subject: "Child", parentId: 1 });
  expect(child.details.tasks[1]?.parentId).toBe(1);
  const failed = await tool.execute("3", { action: "delete", id: 1 });
  expect(failed.details.error).toContain("non-deleted descendant");
  expect(failed.details.tasks).toEqual(child.details.tasks);
  const limited = await tool.execute("4", {
    action: "create",
    subject: "Rejected",
    metadata: { large: "x".repeat(MAX_METADATA_BYTES) }
  });
  expect(limited.details.error).toContain("serialized bytes");
  expect(limited.details.tasks).toEqual(child.details.tasks);
  expect(limited.details.params.metadata).toBeUndefined();
  expect(created.details.nextId).toBe(2);
  const withMetadata = await tool.execute("metadata", {
    action: "update",
    id: 1,
    metadata: { ["__proto__"]: { source: "model" }, phase: "implementation" }
  });
  expect(withMetadata.details.error).toBeUndefined();
  const metadata = withMetadata.details.tasks[0]!.metadata!;
  expect(metadata).toEqual({ ["__proto__"]: { source: "model" }, phase: "implementation" });
  expect(Object.hasOwn(metadata, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(metadata)).toBe(Object.prototype);
});

it("keeps every tool action replayable and private state independent of emitted details", async () => {
  const controller = new TodoController();
  const tool = createTodoTool(controller);
  const calls: Parameters<typeof tool.execute>[1][] = [
    { action: "create", subject: "Root", metadata: { items: ["original"] } },
    { action: "create", subject: "Child", parentId: 1, blockedBy: [1] },
    { action: "update", id: 1, status: "in_progress" },
    { action: "list" },
    { action: "get", id: 1 },
    { action: "delete", id: 1 },
    { action: "delete", id: 2 },
    { action: "delete", id: 1 },
    { action: "clear" }
  ];

  for (const [index, args] of calls.entries()) {
    const result = await tool.execute(String(index), args);
    const state = controller.getState();
    expect(parseTodoStateSnapshot(result.details)).toEqual(state);
    if (index === 5) expect(result.details.error).toContain("non-deleted descendant");
    else expect(result.details.error).toBeUndefined();

    for (const task of result.details.tasks) {
      task.subject = "Changed result";
      task.blockedBy?.push(99);
      if (task.metadata) task.metadata.items = ["Changed result"];
    }

    result.details.params.blockedBy?.push(99);
    if (result.details.params.metadata) result.details.params.metadata.items = ["Changed params"];
    expect(controller.getState()).toEqual(state);
  }

  expect(controller.getState()).toEqual({ tasks: [], nextId: 1 });
});

it("preflights oversized, deep, cyclic and non-JSON metadata into replayable failures", async () => {
  const controller = new TodoController();
  const tool = createTodoTool(controller);
  await tool.execute("seed", { action: "create", subject: "Preserved" });
  const before = controller.getState();
  let deep: Record<string, unknown> = {};
  for (let depth = 0; depth < MAX_METADATA_DEPTH; depth += 1) deep = { nested: deep };
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  for (const { metadata, error } of [
    { metadata: { large: "x".repeat(MAX_METADATA_BYTES) }, error: "serialized bytes" },
    { metadata: deep, error: "maximum depth" },
    { metadata: cyclic, error: "serialized bytes" },
    { metadata: { invalid: undefined }, error: "JSON-serializable" },
    { metadata: { invalid: Number.NaN }, error: "JSON-serializable" },
    { metadata: { invalid: -0 }, error: "JSON-serializable" },
    { metadata: { invalid: new Date(0) }, error: "serialized bytes" }
  ]) {
    const result = await tool.execute("rejected", { action: "update", id: 1, metadata });
    expect(result.details.error).toContain(error);
    expect(result.details.params.metadata).toBeUndefined();
    expect(parseTodoStateSnapshot(result.details)).toEqual(before);
    expect(controller.getState()).toEqual(before);
  }
});
