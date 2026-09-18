import { expect, it } from "vite-plus/test";

import { MAX_METADATA_BYTES } from "./constants.ts";
import { TodoController } from "./controller.ts";
import { createTodoTool } from "./tool.ts";

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
