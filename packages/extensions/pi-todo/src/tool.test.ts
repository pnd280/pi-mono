import { fauxToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import { expect, it } from "vite-plus/test";

import { MAX_METADATA_BYTES } from "./constants.ts";
import { TodoController } from "./controller.ts";
import { createTodoTool } from "./tool.ts";

it("projects model-facing parameters without weakening the todo input shape", () => {
  const tool = createTodoTool(new TodoController());
  const serialized = JSON.stringify(tool.parameters);
  for (const keyword of ["~standard", "minimum", "maximum"])
    expect(serialized).not.toContain(`"${keyword}"`);

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
  const created = await tool.execute("1", { action: "create", subject: "Root" });
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
    metadata: { ["__proto__"]: "literal" }
  });
  expect(
    Object.getOwnPropertyDescriptor(withMetadata.details.tasks[0]?.metadata, "__proto__")?.value
  ).toBe("literal");
});
