import { expect, it } from "vite-plus/test";

import { TodoController } from "./state/controller.ts";
import { MAX_METADATA_BYTES, MAX_METADATA_DEPTH } from "./state/limits.ts";
import { parseTodoStateSnapshot } from "./state/session-state.ts";
import { createTodoTool } from "./tool.ts";

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
