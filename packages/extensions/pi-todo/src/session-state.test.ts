import assert from "node:assert/strict";

import type { JsonObject } from "@earendil-works/pi-ai";
import { describe, it } from "vite-plus/test";

import {
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_OVERHEAD_BYTES,
  MAX_LEGACY_SNAPSHOT_BYTES,
  MAX_LEGACY_TASKS,
  MAX_METADATA_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS,
  TASK_DETAILS_VERSION
} from "./constants.ts";
import { emptyTodoState } from "./reducer.ts";
import { parseTodoStateSnapshot, todoStateFromBranch } from "./session-state.ts";
import type { Task, TaskDetails } from "./types.ts";

function todoResultEntry<Details>(details: Details, isError = false) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "todo",
      details,
      isError
    }
  };
}

describe("todo session state", () => {
  it("restores the latest valid todo tool snapshot from a branch", () => {
    const first: TaskDetails = {
      action: "create",
      params: { subject: "First" },
      tasks: [{ id: 1, subject: "First", status: "pending" }],
      nextId: 2
    };
    const latest: TaskDetails = {
      action: "clear",
      params: {},
      tasks: [],
      nextId: 1
    };

    const restored = todoStateFromBranch([
      todoResultEntry(first),
      todoResultEntry(latest),
      { type: "message", message: { role: "toolResult", toolName: "bash", details: first } }
    ]);

    assert.deepEqual(restored, emptyTodoState());
  });

  it("normalizes unversioned and version 1 snapshots to root todos", () => {
    const taskWithFutureParent = {
      id: 1,
      subject: "Historical root",
      status: "pending" as const,
      parentId: 99
    };
    const expected = {
      tasks: [{ id: 1, subject: "Historical root", status: "pending" }],
      nextId: 2
    };

    assert.deepEqual(
      parseTodoStateSnapshot({ tasks: [taskWithFutureParent], nextId: 2 }),
      expected
    );
    assert.deepEqual(
      parseTodoStateSnapshot({ version: 1, tasks: [taskWithFutureParent], nextId: 2 }),
      expected
    );
  });

  it("restores valid version 2 forests without changing source sibling order", () => {
    const tasks = [
      { id: 3, subject: "First child by source order", status: "pending", parentId: 1 },
      { id: 1, subject: "Root", status: "completed" },
      { id: 2, subject: "Second child by source order", status: "deleted", parentId: 1 },
      { id: 4, subject: "Deleted grandchild", status: "deleted", parentId: 2 }
    ] satisfies Task[];

    assert.deepEqual(parseTodoStateSnapshot({ version: TASK_DETAILS_VERSION, tasks, nextId: 5 }), {
      tasks,
      nextId: 5
    });
  });

  it("rejects invalid version 2 forests and falls back atomically", () => {
    const versionTwo = (tasks: Task[]) => ({
      version: TASK_DETAILS_VERSION,
      tasks,
      nextId: Math.max(0, ...tasks.map((task) => task.id)) + 1
    });
    const invalidForests = [
      versionTwo([{ id: 1, subject: "Missing parent", status: "pending", parentId: 99 }]),
      versionTwo([{ id: 1, subject: "Self parent", status: "pending", parentId: 1 }]),
      versionTwo([
        { id: 1, subject: "Cycle one", status: "pending", parentId: 2 },
        { id: 2, subject: "Cycle two", status: "pending", parentId: 1 }
      ]),
      versionTwo(
        Array.from({ length: 9 }, (_, index): Task => {
          const task: Task = {
            id: index + 1,
            subject: `Level ${index + 1}`,
            status: "pending"
          };
          if (index > 0) task.parentId = index;

          return task;
        })
      ),
      versionTwo([
        { id: 1, subject: "Deleted ancestor", status: "deleted" },
        { id: 2, subject: "Live child", status: "pending", parentId: 1 }
      ])
    ];

    for (const snapshot of invalidForests) {
      assert.equal(parseTodoStateSnapshot(snapshot), undefined);
    }

    const valid = versionTwo([
      { id: 1, subject: "Valid root", status: "pending" },
      { id: 2, subject: "Valid child", status: "pending", parentId: 1 }
    ]);
    assert.deepEqual(
      todoStateFromBranch([todoResultEntry(valid), todoResultEntry(invalidForests.at(-1))]),
      { tasks: valid.tasks, nextId: valid.nextId }
    );
  });

  it.each([1, TASK_DETAILS_VERSION])(
    "enforces version %s field limits after expanding description tabs",
    (version) => {
      const task: Task = {
        id: 1,
        subject: "Tab-indented description",
        description: "\t".repeat(MAX_DESCRIPTION_LENGTH / 2),
        status: "pending"
      };
      const snapshot = { version, tasks: [task], nextId: 2 };
      const restored = parseTodoStateSnapshot(snapshot);
      assert.ok(restored);
      assert.equal(restored.tasks[0]?.description, " ".repeat(MAX_DESCRIPTION_LENGTH));

      const oversized = {
        ...snapshot,
        tasks: [{ ...task, description: `${task.description}\t` }]
      };
      assert.equal(parseTodoStateSnapshot(oversized), undefined);
      assert.deepEqual(
        todoStateFromBranch([todoResultEntry(snapshot), todoResultEntry(oversized)]),
        restored
      );
    }
  );

  it("rejects semantically corrupt todo graphs and colliding next ids", () => {
    const task = (id: number, blockedBy?: number[]): Task => {
      const candidate: Task = { id, subject: `Todo ${id}`, status: "pending" };
      if (blockedBy !== undefined) candidate.blockedBy = blockedBy;

      return candidate;
    };

    assert.equal(parseTodoStateSnapshot({ tasks: [task(1), task(1)], nextId: 2 }), undefined);
    assert.equal(parseTodoStateSnapshot({ tasks: [task(2)], nextId: 2 }), undefined);
    assert.equal(parseTodoStateSnapshot({ tasks: [task(1, [99])], nextId: 2 }), undefined);
    assert.equal(parseTodoStateSnapshot({ tasks: [task(1, [1])], nextId: 2 }), undefined);
    assert.equal(
      parseTodoStateSnapshot({ tasks: [task(1, [2]), task(2, [1])], nextId: 3 }),
      undefined
    );
  });

  it("rejects version 1 and version 2 snapshots over the current todo-count limit", () => {
    const taskCount = MAX_TASKS + 1;
    const tasks = Array.from({ length: taskCount }, (_, index): Task => {
      const id = index + 1;
      const task: Task = { id, subject: `Todo ${id}`, status: "pending" };
      if (id < taskCount) task.blockedBy = [id + 1];

      return task;
    });

    for (const version of [1, TASK_DETAILS_VERSION] as const) {
      assert.equal(parseTodoStateSnapshot({ version, tasks, nextId: taskCount + 1 }), undefined);
    }
  });

  it("rejects replay snapshots whose fields, dependencies, or metadata exceed limits", () => {
    const task = { id: 1, subject: "Todo", status: "pending" };
    assert.equal(
      parseTodoStateSnapshot({
        version: TASK_DETAILS_VERSION,
        tasks: [{ ...task, subject: "s".repeat(MAX_SUBJECT_LENGTH + 1) }],
        nextId: 2
      }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({
        version: TASK_DETAILS_VERSION,
        tasks: [
          {
            ...task,
            blockedBy: Array.from({ length: MAX_DEPENDENCIES + 1 }, () => 2)
          },
          { id: 2, subject: "Dependency", status: "pending" }
        ],
        nextId: 3
      }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({
        version: TASK_DETAILS_VERSION,
        tasks: [{ ...task, metadata: { value: "m".repeat(MAX_METADATA_BYTES) } }],
        nextId: 2
      }),
      undefined
    );
  });

  it("rejects version 1 and version 2 snapshots over the serialized-size limit", () => {
    const tasks = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      subject: `Todo ${index + 1}`,
      description: "d".repeat(MAX_DESCRIPTION_LENGTH),
      status: "pending"
    }));

    for (const version of [1, TASK_DETAILS_VERSION] as const) {
      assert.equal(parseTodoStateSnapshot({ version, tasks, nextId: tasks.length + 1 }), undefined);
    }
  });

  it.each([
    ["current", TASK_DETAILS_VERSION, MAX_SNAPSHOT_BYTES],
    ["legacy", undefined, MAX_LEGACY_SNAPSHOT_BYTES]
  ] as const)(
    "keeps %s todo capacity separate from result overhead",
    (_label, version, maximumBytes) => {
      const metadata = { padding: "" };
      const tasks: Task[] = Array.from({ length: 128 }, (_, index) => ({
        id: index + 1,
        subject: "x",
        status: "pending",
        description: "d".repeat(MAX_DESCRIPTION_LENGTH)
      }));
      const first = tasks[0];
      assert.ok(first);
      first.metadata = metadata;
      const state = { tasks, nextId: 129 };
      metadata.padding = "m".repeat(maximumBytes - Buffer.byteLength(JSON.stringify(state)));
      const details = { version, action: "list", params: {}, ...state };
      assert.deepEqual(parseTodoStateSnapshot(details), state);
      assert.equal(
        parseTodoStateSnapshot({ ...details, unknown: "x".repeat(MAX_DETAILS_OVERHEAD_BYTES) }),
        undefined
      );
      metadata.padding += "m";
      assert.equal(parseTodoStateSnapshot(details), undefined);
    }
  );

  it("accepts bounded legacy snapshots beyond all current per-field limits", () => {
    const taskCount = MAX_TASKS + 1;
    let metadata: JsonObject = { value: "m".repeat(MAX_METADATA_BYTES) };
    for (let depth = 0; depth < 10; depth += 1) metadata = { nested: metadata };
    const tasks = Array.from({ length: taskCount }, (_, index): Task => {
      const task: Task = {
        id: index + 1,
        subject: index === 0 ? "s".repeat(MAX_SUBJECT_LENGTH + 1) : `Todo ${index + 1}`,
        status: "pending"
      };

      if (index === 0) {
        task.description = "d".repeat(MAX_DESCRIPTION_LENGTH + 1);
        task.blockedBy = Array.from({ length: MAX_DEPENDENCIES + 1 }, (_value, id) => id + 2);
        task.metadata = metadata;
      }

      return task;
    });

    const restored = parseTodoStateSnapshot({ tasks, nextId: taskCount + 1 });

    assert.ok(restored);
    assert.equal(restored.tasks.length, taskCount);
    assert.equal(restored.tasks[0]?.blockedBy?.length, MAX_DEPENDENCIES + 1);
  });

  it("enforces the explicit legacy todo ceiling and rejects future versions", () => {
    const tasks = Array.from({ length: MAX_LEGACY_TASKS + 1 }, (_, index) => ({
      id: index + 1,
      subject: "x",
      status: "pending"
    }));
    assert.equal(parseTodoStateSnapshot({ tasks, nextId: tasks.length + 1 }), undefined);
    assert.equal(
      parseTodoStateSnapshot({ version: TASK_DETAILS_VERSION + 1, tasks: [], nextId: 1 }),
      undefined
    );
  });

  it("restores current domain-error detail snapshots", () => {
    const tasks = [{ id: 1, subject: "Domain snapshot", status: "pending" }];
    const domainError = {
      version: TASK_DETAILS_VERSION,
      action: "update",
      params: { id: 99 },
      error: "#99 not found",
      tasks,
      nextId: 2
    };

    assert.deepEqual(todoStateFromBranch([todoResultEntry(domainError)]), {
      tasks,
      nextId: 2
    });
  });

  it("falls back from malformed and host-error latest entries", () => {
    const valid = {
      tasks: [{ id: 1, subject: "Fallback", status: "pending" }],
      nextId: 2
    };

    assert.deepEqual(
      todoStateFromBranch([
        todoResultEntry(valid),
        todoResultEntry({ tasks: [], nextId: 1 }, true),
        todoResultEntry({ tasks: "bad", nextId: 1 }),
        { type: "message" as const, message: null }
      ]),
      {
        tasks: [{ id: 1, subject: "Fallback", status: "pending" }],
        nextId: 2
      }
    );
  });

  it("ignores malformed snapshots", () => {
    assert.equal(parseTodoStateSnapshot({ tasks: [], nextId: "1" }), undefined);
    assert.equal(parseTodoStateSnapshot({ tasks: [], nextId: 1.5 }), undefined);
    assert.equal(
      parseTodoStateSnapshot({ tasks: [], nextId: Number.MAX_SAFE_INTEGER + 1 }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({
        tasks: [{ id: Number.MAX_SAFE_INTEGER + 1, subject: "Unsafe id", status: "pending" }],
        nextId: 2
      }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({ tasks: [{ id: 1, subject: "Missing status" }], nextId: 2 }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({
        tasks: [{ id: -1, subject: "Bad id", status: "pending" }],
        nextId: 2
      }),
      undefined
    );
    assert.equal(
      parseTodoStateSnapshot({
        tasks: [{ id: 1, subject: "Bad dependency", status: "pending", blockedBy: [1.5] }],
        nextId: 2
      }),
      undefined
    );
  });
});
