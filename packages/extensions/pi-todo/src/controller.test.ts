import { expect, it } from "vite-plus/test";

import { TodoController } from "./controller.ts";

it("isolates mutation, read, and replay metadata aliases", () => {
  const controller = new TodoController();
  const metadata = { nested: { items: ["original"] } };
  const result = controller.apply("create", { subject: "Todo", metadata });
  metadata.nested.items.push("changed");
  result.details.tasks[0]!.metadata = { changed: true };
  result.details.tasks[0]!.subject = "changed";
  result.details.params.metadata = { changed: true };
  const read = controller.getState();
  read.tasks[0]!.metadata = { changed: true };
  expect(controller.getTodos()[0]).toMatchObject({
    subject: "Todo",
    metadata: { nested: { items: ["original"] } }
  });
  const updated = controller.apply("update", { id: 1, owner: "agent" });
  expect(updated.details.tasks[0]).toMatchObject({
    subject: "Todo",
    owner: "agent",
    metadata: { nested: { items: ["original"] } }
  });
  const snapshot = controller.getState();
  const replayMetadata = { nested: { items: ["replayed"] } };
  snapshot.tasks[0]!.metadata = replayMetadata;
  controller.reconstructFromBranch([
    { type: "message", message: { role: "toolResult", toolName: "todo", details: snapshot } }
  ]);
  snapshot.tasks[0]!.subject = "changed";
  replayMetadata.nested.items.push("changed");
  expect(controller.getTodos()[0]).toMatchObject({
    subject: "Todo",
    metadata: { nested: { items: ["replayed"] } }
  });
  controller.reconstructFromBranch([]);
  expect(controller.getState()).toEqual({ tasks: [], nextId: 1 });
});

it("advances the presentation revision for mutations and reconstruction, not reads or failures", () => {
  const controller = new TodoController();
  expect(controller.getRevision()).toBe(0);
  controller.apply("create", { subject: "Todo" });
  expect(controller.getRevision()).toBe(1);
  controller.apply("list", {});
  controller.apply("get", { id: 1 });
  controller.apply("update", { id: 99, subject: "Missing" });
  expect(controller.getRevision()).toBe(1);
  controller.apply("update", { id: 1, subject: "Updated" });
  expect(controller.getRevision()).toBe(2);
  controller.apply("delete", { id: 1 });
  expect(controller.getRevision()).toBe(3);
  controller.apply("clear", {});
  expect(controller.getRevision()).toBe(4);
  controller.reconstructFromBranch([]);
  expect(controller.getRevision()).toBe(5);
});
