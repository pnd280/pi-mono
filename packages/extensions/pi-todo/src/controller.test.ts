import { expect, it } from "vite-plus/test";

import { TodoController } from "./controller.ts";

it("isolates mutation, read, and replay metadata aliases", () => {
  const controller = new TodoController();
  const metadata = { nested: { items: ["original"] } };
  const result = controller.apply("create", { subject: "Task", metadata });
  metadata.nested.items.push("changed");
  result.state.tasks[0]!.metadata = { changed: true };
  result.details.tasks[0]!.subject = "changed";
  const read = controller.getState();
  read.tasks[0]!.metadata = { changed: true };
  expect(controller.getTodos()[0]).toMatchObject({
    subject: "Task",
    metadata: { nested: { items: ["original"] } }
  });
  const snapshot = controller.getState();
  controller.reconstructFromBranch([
    { type: "message", message: { role: "toolResult", toolName: "todo", details: snapshot } }
  ]);
  snapshot.tasks[0]!.subject = "changed";
  expect(controller.getTodos()[0]?.subject).toBe("Task");
  controller.reconstructFromBranch([]);
  expect(controller.getState()).toEqual({ tasks: [], nextId: 1 });
});

it("advances the revision only when a mutation changes state", () => {
  const controller = new TodoController();
  const initial = controller.getRevision();

  controller.apply("list", {});
  controller.apply("get", { id: 99 });
  expect(controller.getRevision()).toBe(initial);

  controller.apply("create", { subject: "Task" });
  const created = controller.getRevision();
  expect(created).toBeGreaterThan(initial);

  controller.apply("list", {});
  expect(controller.getRevision()).toBe(created);

  controller.reconstructFromBranch([]);
  expect(controller.getRevision()).toBeGreaterThan(created);
});
