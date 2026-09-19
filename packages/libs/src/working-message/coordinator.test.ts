import { expect, it, vi } from "vite-plus/test";

import { WorkingMessageCoordinator } from "./coordinator.ts";

it("composes independent components in preference order, retaining inactive registrations", () => {
  const coordinator = new WorkingMessageCoordinator();
  const activity = coordinator.register({
    id: "todo.activity",
    label: "Activity",
    contributor: "todo"
  });
  const other = coordinator.register({ id: "other.status", label: "Status", contributor: "other" });
  const writer = vi.fn();
  coordinator.start(writer, ["todo.activity", "missing", "other.status"]);
  expect(writer).toHaveBeenLastCalledWith(undefined);
  other.setText("Other status");
  activity.setText("Activity");
  expect(writer).toHaveBeenLastCalledWith("Activity · Other status");
  coordinator.setOrder(["other.status", "todo.activity"]);
  expect(writer).toHaveBeenLastCalledWith("Other status · Activity");
  activity.setText("\n \t");
  expect(writer).toHaveBeenLastCalledWith("Other status");
  expect(coordinator.snapshot()).toHaveLength(2);
  other.setText();
  expect(writer).toHaveBeenLastCalledWith(undefined);
  expect(coordinator.snapshot().every((entry) => entry.text === "")).toBe(true);
});

it("invalidates disposed handles without letting them clear their replacement", () => {
  const coordinator = new WorkingMessageCoordinator();
  const definition = { id: "test.activity", label: "Activity", contributor: "test" };
  const stale = coordinator.register(definition);
  expect(() => coordinator.register(definition)).toThrow("Duplicate");
  stale.dispose();
  const current = coordinator.register(definition);
  current.setText("Current");
  stale.setText("Stale");
  stale.dispose();
  expect(coordinator.snapshot()[0]?.text).toBe("Current");
});

it("clears contributions on start and prevents stale writes after shutdown", () => {
  const coordinator = new WorkingMessageCoordinator();
  const handle = coordinator.register({ id: "activity", label: "Activity", contributor: "test" });
  const writer = vi.fn();
  coordinator.start(writer, []);
  handle.setText("Old session");
  coordinator.start(writer, []);
  expect(writer).toHaveBeenLastCalledWith(undefined);
  handle.setText("Current session");
  coordinator.shutdown();
  expect(writer).toHaveBeenLastCalledWith(undefined);
  writer.mockClear();
  handle.setText("Late async work");
  handle.dispose();
  coordinator.shutdown();
  expect(writer).not.toHaveBeenCalled();
  expect(coordinator.snapshot()).toEqual([]);
});

it("normalizes text once and never emits terminal controls or multiline messages", () => {
  const coordinator = new WorkingMessageCoordinator();
  const handle = coordinator.register({ id: "activity", label: "Activity", contributor: "test" });
  const writer = vi.fn();
  coordinator.start(writer, []);
  handle.setText("\x1b]0;spoof\x07\x1b[31mWorking\n now\x1b[0m");
  expect(writer).toHaveBeenLastCalledWith("Working now");
  const snapshot = coordinator.snapshot();
  snapshot[0]!.text = "Mutation";
  expect(coordinator.snapshot()[0]?.text).toBe("Working now");
});
