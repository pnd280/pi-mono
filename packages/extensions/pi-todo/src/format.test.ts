import { expect, it } from "vite-plus/test";

import { formatTodosCommandOutput, formatTodosSummary } from "./format.ts";
import type { Task } from "./types.ts";

it.each([{ tasks: [] }, { tasks: [{ id: 1, subject: "Deleted", status: "deleted" }] }] satisfies {
  tasks: readonly Task[];
}[])("formats empty and all-deleted snapshots as empty todos", ({ tasks }) => {
  expect(formatTodosSummary(tasks)).toBe("No todos yet. Ask the agent to add some!");
  expect(formatTodosCommandOutput(tasks)).toBe("○ No todos yet. Ask the agent to add some!");
});

it("summarises visible statuses in completed, in-progress, pending order", () => {
  const tasks: Task[] = [
    { id: 1, subject: "Pending", status: "pending" },
    { id: 2, subject: "Active", status: "in_progress" },
    { id: 3, subject: "Done", status: "completed" },
    { id: 4, subject: "Deleted", status: "deleted" }
  ];
  expect(formatTodosSummary(tasks)).toBe("1/3 completed · 1 in progress · 1 pending");
  expect(formatTodosCommandOutput(tasks).split("\n")[0]).toBe(
    "1/3 completed · 1 in progress · 1 pending"
  );
});
