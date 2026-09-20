import assert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_OVERHEAD_BYTES,
  MAX_LEGACY_SNAPSHOT_BYTES,
  MAX_LIST_LINES,
  MAX_METADATA_BYTES,
  MAX_METADATA_DEPTH,
  MAX_OWNER_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS,
  TASK_DETAILS_VERSION
} from "./constants.ts";
import { applyTaskMutation, detectCycle, emptyTodoState } from "./reducer.ts";
import { parseTodoStateSnapshot } from "./session-state.ts";
import type { JsonObject, Task, TaskMutationParams, TodoState } from "./types.ts";

function mutate(
  state: TodoState,
  action: Parameters<typeof applyTaskMutation>[1],
  params: TaskMutationParams
) {
  return applyTaskMutation(state, action, params);
}

describe("todo reducer", () => {
  it("creates, lists, gets, updates, deletes, and clears tasks", () => {
    let state = emptyTodoState();

    const created = mutate(state, "create", {
      subject: "Research existing tool",
      description: "Read source behavior",
      owner: "agent",
      metadata: { phase: "scout" }
    });
    state = created.state;

    assert.equal(created.content[0]?.text, "Created #1: Research existing tool (pending)");
    assert.equal(created.details.nextId, 2);
    assert.deepEqual(created.details.tasks[0], {
      id: 1,
      subject: "Research existing tool",
      description: "Read source behavior",
      status: "pending",
      owner: "agent",
      metadata: { phase: "scout" }
    });

    const updated = mutate(state, "update", {
      id: 1,
      status: "in_progress",
      inProgressLabel: "researching source",
      metadata: { phase: "implementation", owner: null }
    });
    state = updated.state;

    assert.equal(updated.content[0]?.text, "Updated #1 (pending → in_progress)");
    assert.deepEqual(updated.details.tasks[0]?.metadata, { phase: "implementation" });

    const listed = mutate(state, "list", {});
    assert.equal(
      listed.content[0]?.text,
      "[in_progress] #1 Research existing tool (researching source)"
    );

    const got = mutate(state, "get", { id: 1 });
    assert.equal(
      got.content[0]?.text,
      [
        "#1 [in_progress] Research existing tool",
        "  description: Read source behavior",
        "  inProgressLabel: researching source",
        "  owner: agent"
      ].join("\n")
    );

    const deleted = mutate(state, "delete", { id: 1 });
    state = deleted.state;
    assert.equal(deleted.content[0]?.text, "Deleted #1: Research existing tool");
    assert.equal(deleted.details.tasks[0]?.status, "deleted");

    assert.equal(mutate(state, "list", {}).content[0]?.text, "No tasks");
    assert.equal(
      mutate(state, "list", { includeDeleted: true }).content[0]?.text,
      "[deleted] #1 Research existing tool"
    );

    const cleared = mutate(state, "clear", {});
    assert.equal(cleared.content[0]?.text, "Cleared 1 tasks");
    assert.deepEqual(cleared.details.tasks, []);
    assert.equal(cleared.details.nextId, 1);
  });

  it("projects model-controlled text to terminal-safe state and result content", () => {
    const created = mutate(emptyTodoState(), "create", {
      subject: "Implement\x1b[31m\nspoof",
      description: "First \x1b[32mline\x1b[0m\nSecond\tcolumn",
      inProgressLabel: "working\x1b]0;owned\x07\nnow",
      owner: "agent\x1b[2J\nname"
    });

    assert.deepEqual(created.state.tasks[0], {
      id: 1,
      subject: "Implement spoof",
      description: "First line\nSecond  column",
      inProgressLabel: "working now",
      status: "pending",
      owner: "agent name"
    });
    assert.equal(created.content[0]?.text, "Created #1: Implement spoof (pending)");
    assert.deepEqual(created.details.params, {
      subject: "Implement spoof",
      description: "First line\nSecond  column",
      inProgressLabel: "working now",
      owner: "agent name"
    });

    const updated = mutate(created.state, "update", {
      id: 1,
      subject: "Updated\x1b[2K\nsubject",
      description: "Safe paragraph one\n\nSafe paragraph two\x1b[31m",
      inProgressLabel: "testing\x9b31m\nnow",
      owner: "owner\x00\nnext"
    });
    const task = updated.state.tasks[0];
    assert.ok(task);
    assert.equal(task.subject, "Updated subject");
    assert.equal(task.description, "Safe paragraph one\n\nSafe paragraph two");
    assert.equal(task.inProgressLabel, "testing now");
    assert.equal(task.owner, "owner next");
    assert.equal(JSON.stringify(updated).includes("\x1b"), false);
    assert.equal(JSON.stringify(updated).includes("\x9b"), false);

    const emptySubject = mutate(emptyTodoState(), "create", { subject: "\x1b[31m\x1b[0m" });
    assert.equal(emptySubject.details.error, "subject required for create");
  });

  it("preserves literal __proto__ metadata keys during updates", () => {
    const state = mutate(emptyTodoState(), "create", {
      subject: "Keep literal metadata keys",
      metadata: { phase: "scout" }
    }).state;
    const updateMetadata = {
      ["__proto__"]: { source: "model" },
      phase: "implementation"
    };

    const updated = mutate(state, "update", { id: 1, metadata: updateMetadata });
    const metadata = updated.state.tasks[0]?.metadata;

    assert.ok(metadata);
    assert.deepEqual(metadata, updateMetadata);
    assert.equal(Object.hasOwn(metadata, "__proto__"), true);
    assert.equal(Object.getPrototypeOf(metadata), Object.prototype);
  });

  it.each<["update" | "delete", TaskMutationParams]>([
    ["update", { id: 2, subject: "Renamed" }],
    ["update", { id: 2, parentId: 3 }],
    ["update", { id: 2, metadata: { values: ["replacement"], remove: null } }],
    ["update", { id: 2, metadata: { values: null, remove: null } }],
    ["delete", { id: 2 }]
  ])("isolates state and result snapshots for %s with %j", (action, params) => {
    const initial = (): TodoState => ({
      tasks: [
        { id: 1, subject: "Parent", status: "pending", metadata: { values: ["parent"] } },
        {
          id: 2,
          subject: "Child",
          status: "pending",
          parentId: 1,
          blockedBy: [1],
          metadata: { values: ["child"], remove: true }
        },
        { id: 3, subject: "Destination", status: "pending", metadata: { values: ["destination"] } }
      ],
      nextId: 4
    });
    const state = initial();
    const result = mutate(state, action, params);
    assert.equal(result.details.error, undefined);
    assert.deepEqual(state, initial());
    assert.deepEqual(result.details.tasks, result.state.tasks);
    const expected = mutate(initial(), action, params);

    for (const task of result.state.tasks) {
      task.blockedBy?.push(99);

      if (task.metadata) {
        assert.ok(Array.isArray(task.metadata.values));
        task.metadata.values.push("changed state");
      }
    }

    assert.deepEqual(state, initial());
    assert.deepEqual(result.details.tasks, expected.details.tasks);

    for (const task of result.details.tasks) {
      task.blockedBy?.push(100);

      if (task.metadata) {
        assert.ok(Array.isArray(task.metadata.values));
        task.metadata.values.push("changed details");
      }
    }

    assert.deepEqual(state, initial());
    if (Array.isArray(params.metadata?.values))
      assert.deepEqual(params.metadata.values, ["replacement"]);
  });

  it("preserves source-compatible validation errors with complete state snapshots", () => {
    let state = emptyTodoState();

    const missingSubject = mutate(state, "create", { subject: "" });
    assert.equal(missingSubject.content[0]?.text, "Error: subject required for create");
    assert.equal(missingSubject.details.error, "subject required for create");
    assert.equal(missingSubject.details.nextId, 1);
    assert.deepEqual(missingSubject.details.tasks, []);

    state = mutate(state, "create", { subject: "One" }).state;
    state = mutate(state, "create", { subject: "Two" }).state;

    const illegalTransition = mutate(state, "update", { id: 1, status: "deleted" }).state;
    const deleted = mutate(illegalTransition, "delete", { id: 1 }).state;
    const restoreDeleted = mutate(deleted, "update", { id: 1, status: "pending" });

    assert.equal(restoreDeleted.content[0]?.text, "Error: illegal transition deleted → pending");
    assert.equal(restoreDeleted.details.error, "illegal transition deleted → pending");
    assert.equal(restoreDeleted.details.tasks[0]?.status, "deleted");
    assert.equal(restoreDeleted.details.nextId, deleted.nextId);

    const selfBlock = mutate(state, "update", { id: 1, addBlockedBy: [1] });
    assert.equal(selfBlock.details.error, "cannot block #1 on itself");

    const missingDependency = mutate(state, "update", { id: 1, addBlockedBy: [99] });
    assert.equal(missingDependency.details.error, "addBlockedBy: #99 not found");
  });

  it("rejects non-positive, non-integer, and unsafe task ids", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "One" }).state;

    assert.equal(mutate(state, "get", { id: 1.5 }).details.error, "invalid task id 1.5");
    assert.equal(mutate(state, "delete", { id: -1 }).details.error, "invalid task id -1");
    assert.equal(
      mutate(state, "get", { id: Number.MAX_SAFE_INTEGER + 1 }).details.error,
      `invalid task id ${Number.MAX_SAFE_INTEGER + 1}`
    );
    assert.equal(
      mutate(state, "update", { id: 0, status: "in_progress" }).details.error,
      "invalid task id 0"
    );
    assert.equal(
      mutate(state, "create", { subject: "Two", blockedBy: [1, 2.5] }).details.error,
      "blockedBy: invalid task id 2.5"
    );
    assert.equal(
      mutate(state, "update", { id: 1, addBlockedBy: [2.5] }).details.error,
      "addBlockedBy: invalid task id 2.5"
    );
    assert.equal(
      mutate(state, "update", { id: 1, removeBlockedBy: [-1] }).details.error,
      "removeBlockedBy: invalid task id -1"
    );
    assert.equal(
      mutate({ tasks: [], nextId: Number.MAX_SAFE_INTEGER }, "create", {
        subject: "No safe successor id"
      }).details.error,
      "task id limit reached"
    );
  });

  it("detects 15,000-deep acyclic and cyclic graphs without recursive stack growth", () => {
    const taskCount = 15_000;
    const tasks = Array.from({ length: taskCount }, (_, index) => {
      const task: Task = {
        id: index + 1,
        subject: `Task ${index + 1}`,
        status: "pending"
      };
      if (index + 1 < taskCount) task.blockedBy = [index + 2];

      return task;
    });

    assert.equal(detectCycle(tasks, taskCount, []), false);
    assert.equal(detectCycle(tasks, taskCount, [1]), true);
  });

  it("bounds task fields, dependencies, metadata, task count, and snapshots", () => {
    const state = emptyTodoState();
    assert.equal(
      mutate(state, "create", { subject: "s".repeat(MAX_SUBJECT_LENGTH + 1) }).details.error,
      `subject exceeds ${MAX_SUBJECT_LENGTH} characters`
    );
    assert.equal(
      mutate(state, "create", {
        subject: "Task",
        description: "d".repeat(MAX_DESCRIPTION_LENGTH + 1)
      }).details.error,
      `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`
    );
    assert.equal(
      mutate(state, "create", {
        subject: "Task",
        inProgressLabel: "a".repeat(MAX_IN_PROGRESS_LABEL_LENGTH + 1)
      }).details.error,
      `inProgressLabel exceeds ${MAX_IN_PROGRESS_LABEL_LENGTH} characters`
    );
    assert.equal(
      mutate(state, "create", {
        subject: "Task",
        blockedBy: Array.from({ length: MAX_DEPENDENCIES + 1 }, () => 1)
      }).details.error,
      `blockedBy exceeds ${MAX_DEPENDENCIES} task ids`
    );
    assert.equal(
      mutate(state, "create", {
        subject: "Task",
        metadata: { value: "m".repeat(MAX_METADATA_BYTES) }
      }).details.error,
      `metadata exceeds ${MAX_METADATA_BYTES} serialized bytes`
    );

    let nested: JsonObject = {};
    for (let depth = 0; depth < MAX_METADATA_DEPTH; depth += 1) nested = { nested };
    assert.equal(
      mutate(state, "create", { subject: "Task", metadata: nested }).details.error,
      `metadata exceeds maximum depth of ${MAX_METADATA_DEPTH}`
    );

    const nearlyFullHierarchy: TodoState = {
      tasks: Array.from({ length: MAX_TASKS - 1 }, (_, index): Task => {
        const task: Task = {
          id: index + 1,
          subject: `Task ${index + 1}`,
          status: "pending"
        };
        if (index > 0) task.parentId = 1;

        return task;
      }),
      nextId: MAX_TASKS
    };
    const finalChild = mutate(nearlyFullHierarchy, "create", {
      subject: "Final child",
      parentId: 1
    });
    assert.equal(finalChild.details.error, undefined);
    assert.equal(finalChild.state.tasks.length, MAX_TASKS);
    assert.equal(finalChild.state.tasks.at(-1)?.parentId, 1);
    assert.equal(
      mutate(finalChild.state, "create", { subject: "One too many", parentId: 1 }).details.error,
      `task limit of ${MAX_TASKS} reached`
    );

    let growingState = state;
    let sizeError: string | undefined;

    for (let index = 0; index < MAX_TASKS && sizeError === undefined; index += 1) {
      const result = mutate(growingState, "create", {
        subject: `Task ${index}`,
        description: "d".repeat(MAX_DESCRIPTION_LENGTH)
      });
      sizeError = result.details.error;
      growingState = result.state;
    }

    assert.match(sizeError ?? "", /^result snapshot exceeds \d+ serialized bytes$/);
  });

  it("bounds list content while retaining the complete snapshot", () => {
    const omitted = 25;
    const taskCount = MAX_LIST_LINES + omitted;
    const state: TodoState = {
      tasks: Array.from({ length: taskCount }, (_, index) => ({
        id: index + 1,
        subject: `Task ${index + 1}`,
        status: "pending" as const
      })),
      nextId: taskCount + 1
    };

    const listed = mutate(state, "list", {});
    const lines = listed.content[0]?.text.split("\n") ?? [];

    assert.equal(lines.length, MAX_LIST_LINES + 1);
    assert.match(lines.at(-1) ?? "", new RegExp(`^… ${omitted} more tasks omitted`, "u"));
    assert.deepEqual(listed.details.tasks, state.tasks);
    assert.equal(listed.details.nextId, state.nextId);
    assert.equal(parseTodoStateSnapshot(listed.details)?.tasks.length, taskCount);
  });

  it("includes complete snapshots in list, get, and domain-error details", () => {
    const state = mutate(emptyTodoState(), "create", { subject: "One" }).state;

    for (const result of [
      mutate(state, "list", {}),
      mutate(state, "get", { id: 1 }),
      mutate(state, "get", { id: 99 })
    ]) {
      assert.equal(result.details.version, TASK_DETAILS_VERSION);
      assert.deepEqual(result.details.tasks, state.tasks);
      assert.equal(result.details.nextId, state.nextId);
    }
  });

  it("bounds limit errors without echoing offending or unknown params", () => {
    const state = mutate(emptyTodoState(), "create", { subject: "One" }).state;
    const result = mutate(state, "update", {
      id: 1,
      subject: "s".repeat(MAX_SUBJECT_LENGTH + 100_000),
      description: "d".repeat(10_000_000),
      inProgressLabel: "a".repeat(MAX_IN_PROGRESS_LABEL_LENGTH + 1),
      owner: "o".repeat(MAX_OWNER_LENGTH + 1),
      blockedBy: Array.from({ length: MAX_DEPENDENCIES + 1 }, () => 1),
      metadata: { value: "m".repeat(1_000_000) },
      unknown: "u".repeat(1_000_000)
    });

    assert.equal(result.details.error, `subject exceeds ${MAX_SUBJECT_LENGTH} characters`);
    assert.deepEqual(result.details.params, { id: 1 });
    assert.deepEqual(result.details.tasks, state.tasks);
    assert.equal(result.details.nextId, state.nextId);
    assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= MAX_SNAPSHOT_BYTES);
  });

  it("does not version or mutate legacy state beyond current limits", () => {
    const legacyState: TodoState = {
      tasks: Array.from({ length: MAX_TASKS + 1 }, (_, index) => ({
        id: index + 1,
        subject: `Task ${index + 1}`,
        status: "pending"
      })),
      nextId: MAX_TASKS + 2
    };

    const listed = mutate(legacyState, "list", {});
    assert.equal(listed.details.version, undefined);
    assert.equal(listed.details.tasks.length, legacyState.tasks.length);
    const updated = mutate(legacyState, "update", { id: 1, subject: "Changed" });
    assert.match(updated.details.error ?? "", /^result snapshot exceeds /);
    assert.deepEqual(updated.state, legacyState);
    assert.equal(updated.details.version, undefined);

    const cleared = mutate(legacyState, "clear", {});
    assert.equal(cleared.details.version, TASK_DETAILS_VERSION);
    assert.deepEqual(cleared.state, emptyTodoState());
  });

  it("never downgrades a hierarchy-aware near-ceiling result", () => {
    let state = mutate(emptyTodoState(), "create", {
      subject: "Root",
      description: "d".repeat(MAX_DESCRIPTION_LENGTH)
    }).state;
    let failed: ReturnType<typeof applyTaskMutation> | undefined;
    let previousState = state;

    for (let index = 0; index < MAX_TASKS && failed === undefined; index += 1) {
      previousState = state;
      const result = mutate(state, "create", {
        subject: `Child ${index}`,
        description: "d".repeat(MAX_DESCRIPTION_LENGTH),
        parentId: 1
      });
      if (result.details.error !== undefined) failed = result;
      else state = result.state;
    }

    assert.ok(failed);
    assert.match(failed.details.error ?? "", /^result snapshot exceeds /);
    assert.equal(failed.details.version, TASK_DETAILS_VERSION);
    assert.deepEqual(failed.state, previousState);
    assert.deepEqual(failed.details.tasks, previousState.tasks);
    assert.ok(failed.details.tasks.some((task) => task.parentId === 1));
  });

  it("returns replayable errors after a successful result fills the snapshot ceiling", () => {
    const tasks: Task[] = Array.from({ length: 128 }, (_, index) => ({
      id: index + 1,
      subject: "x",
      status: "pending",
      description: "d".repeat(MAX_DESCRIPTION_LENGTH)
    }));
    const metadata = { padding: "" };
    const root = tasks[0];
    assert.ok(root);
    root.metadata = metadata;
    const params = { subject: "x", parentId: 1 };
    const expected = {
      version: TASK_DETAILS_VERSION,
      action: "create",
      params,
      tasks: [...tasks, { id: 129, subject: "x", status: "pending", parentId: 1 }],
      nextId: 130
    };
    metadata.padding = "m".repeat(MAX_SNAPSHOT_BYTES - Buffer.byteLength(JSON.stringify(expected)));
    const initial = parseTodoStateSnapshot({ version: TASK_DETAILS_VERSION, tasks, nextId: 129 });
    assert.ok(initial);
    const created = mutate(initial, "create", params);
    assert.equal(created.details.error, undefined);
    assert.equal(Buffer.byteLength(JSON.stringify(created.details)), MAX_SNAPSHOT_BYTES);
    const state = parseTodoStateSnapshot(created.details);
    assert.ok(state);

    const missing = mutate(state, "update", { id: 99_999, status: "completed" });
    assert.equal(missing.details.error, "#99999 not found");
    const oversized = mutate(state, "create", {
      subject: "Too large",
      description: "d".repeat(MAX_DESCRIPTION_LENGTH)
    });
    assert.match(oversized.details.error ?? "", /^result snapshot exceeds /);

    for (const result of [missing, oversized, mutate(state, "list", {})]) {
      assert.equal(result.state, state);
      assert.equal(result.details.version, TASK_DETAILS_VERSION);
      assert.deepEqual(parseTodoStateSnapshot(result.details), state);
      assert.ok(
        Buffer.byteLength(JSON.stringify(result.details)) <=
          MAX_SNAPSHOT_BYTES + MAX_DETAILS_OVERHEAD_BYTES
      );
    }
  });

  it("keeps full legacy snapshots replayable at the size ceiling across repeated results", () => {
    const task: Task = { id: 1, subject: "Legacy", status: "pending", description: "" };
    const snapshot = { tasks: [task], nextId: 2 };
    task.description = "d".repeat(
      MAX_LEGACY_SNAPSHOT_BYTES - Buffer.byteLength(JSON.stringify(snapshot))
    );
    const state = parseTodoStateSnapshot(snapshot);
    assert.ok(state);
    let restored = state;

    for (const [action, params] of [
      ["list", {}],
      ["get", { id: 1 }],
      ["update", { id: 99, status: "completed" }],
      ["list", {}]
    ] as const) {
      const result = mutate(restored, action, params);
      assert.equal(result.details.version, undefined);
      if (action === "update") assert.equal(result.details.error, "#99 not found");
      else assert.equal(result.details.error, undefined);
      const replayed = parseTodoStateSnapshot(result.details);
      assert.ok(replayed);
      assert.deepEqual(replayed, state);
      assert.ok(
        Buffer.byteLength(JSON.stringify(result.details)) <=
          MAX_LEGACY_SNAPSHOT_BYTES + MAX_DETAILS_OVERHEAD_BYTES
      );
      restored = replayed;
    }
  });

  it("preserves oversized legacy state even when each task fits the current field limits", () => {
    const state: TodoState = {
      tasks: Array.from({ length: 200 }, (_, index) => ({
        id: index + 1,
        subject: "Task",
        status: "pending",
        description: "d".repeat(MAX_DESCRIPTION_LENGTH)
      })),
      nextId: 201
    };
    assert.deepEqual(parseTodoStateSnapshot(state), state);
    const listed = mutate(state, "list", {});
    assert.equal(listed.details.error, undefined);
    const rejected = mutate(state, "update", { id: 1, subject: "Changed" });
    assert.match(rejected.details.error ?? "", /^result snapshot exceeds /);

    for (const result of [listed, rejected]) {
      assert.equal(result.state, state);
      assert.equal(result.details.version, undefined);
      assert.deepEqual(parseTodoStateSnapshot(result.details), state);
    }
  });

  it("creates roots and children under any live parent status", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Pending parent" }).state;
    state = mutate(state, "create", { subject: "Active parent" }).state;
    state = mutate(state, "update", { id: 2, status: "in_progress" }).state;
    state = mutate(state, "create", { subject: "Completed parent" }).state;
    state = mutate(state, "update", { id: 3, status: "completed" }).state;

    const pendingChild = mutate(state, "create", { subject: "Pending child", parentId: 1 });
    state = pendingChild.state;
    state = mutate(state, "create", { subject: "Active child", parentId: 2 }).state;
    state = mutate(state, "create", { subject: "Completed child", parentId: 3 }).state;
    state = mutate(state, "create", { subject: "Explicit root", parentId: null }).state;

    assert.equal(pendingChild.content[0]?.text, "Created #4 under #1: Pending child (pending)");
    assert.deepEqual(
      state.tasks.map((task) => task.parentId),
      [undefined, undefined, undefined, 1, 2, 3, undefined]
    );

    const deletedParent = mutate(state, "delete", { id: 7 }).state;

    for (const [parentId, error] of [
      [0, "parentId: invalid task id 0"],
      [1.5, "parentId: invalid task id 1.5"],
      [7, "parentId: #7 is deleted"],
      [8, "cannot parent #8 on itself"],
      [99, "parentId: #99 not found"]
    ] as const) {
      const rejected = mutate(deletedParent, "create", { subject: "Rejected", parentId });
      assert.equal(rejected.details.error, error);
      assert.deepEqual(rejected.state, deletedParent);
      assert.deepEqual(rejected.details.tasks, deletedParent.tasks);
    }
  });

  it("reparents and detaches complete subtrees using source sibling order", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root one" }).state;
    state = mutate(state, "create", { subject: "Root two" }).state;
    state = mutate(state, "create", { subject: "Child one", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Child two", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Grandchild", parentId: 3 }).state;

    const deletedDestination = mutate(state, "delete", { id: 4 }).state;

    for (const [parentId, error] of [
      [0, "parentId: invalid task id 0"],
      [1.5, "parentId: invalid task id 1.5"],
      [3, "cannot parent #3 on itself"],
      [4, "parentId: #4 is deleted"],
      [99, "parentId: #99 not found"]
    ] as const) {
      const rejected = mutate(deletedDestination, "update", { id: 3, parentId });
      assert.equal(rejected.details.error, error);
      assert.deepEqual(rejected.state, deletedDestination);
    }

    const moved = mutate(state, "update", { id: 3, parentId: 2 });
    state = moved.state;
    assert.equal(moved.content[0]?.text, "Updated #3 (parent: #2)");
    assert.deepEqual(
      state.tasks.map((task) => task.id),
      [1, 2, 4, 5, 3]
    );
    assert.equal(state.tasks.find((task) => task.id === 5)?.parentId, 3);
    assert.equal(
      mutate(state, "list", {}).content[0]?.text,
      [
        "[pending] #1 Root one",
        "  [pending] #4 Child two",
        "[pending] #2 Root two",
        "  [pending] #3 Child one",
        "    [pending] #5 Grandchild"
      ].join("\n")
    );

    const idempotent = mutate(state, "update", {
      id: 3,
      parentId: 2,
      subject: "Renamed child"
    });
    assert.deepEqual(
      idempotent.state.tasks.map((task) => task.id),
      [1, 2, 4, 5, 3]
    );

    const detached = mutate(idempotent.state, "update", { id: 3, parentId: null });
    assert.equal(detached.content[0]?.text, "Updated #3 (detached to root)");
    assert.equal(detached.state.tasks.at(-1)?.id, 3);
    assert.equal(detached.state.tasks.at(-1)?.parentId, undefined);

    const sameRoot = mutate(detached.state, "update", { id: 1, parentId: null });
    assert.deepEqual(
      sameRoot.state.tasks.map((task) => task.id),
      detached.state.tasks.map((task) => task.id)
    );
  });

  it("rejects hierarchy cycles and depth overflow atomically at level eight", () => {
    let chain = emptyTodoState();

    for (let id = 1; id <= 8; id += 1) {
      const params: TaskMutationParams = { subject: `Level ${id}` };
      if (id > 1) params.parentId = id - 1;
      chain = mutate(chain, "create", params).state;
    }

    const tooDeepCreate = mutate(chain, "create", { subject: "Level 9", parentId: 8 });
    assert.equal(tooDeepCreate.details.error, "parentId would exceed maximum task depth of 8");
    assert.deepEqual(tooDeepCreate.state, chain);

    const cycle = mutate(chain, "update", { id: 1, parentId: 8, subject: "Not applied" });
    assert.equal(cycle.details.error, "parentId would create a cycle");
    assert.deepEqual(cycle.state, chain);
    assert.deepEqual(cycle.details.tasks, chain.tasks);

    let movable = emptyTodoState();

    for (let id = 1; id <= 7; id += 1) {
      const params: TaskMutationParams = { subject: `Destination ${id}` };
      if (id > 1) params.parentId = id - 1;
      movable = mutate(movable, "create", params).state;
    }

    movable = mutate(movable, "create", { subject: "Subtree root" }).state;
    movable = mutate(movable, "create", { subject: "Subtree child", parentId: 8 }).state;
    const tooDeepMove = mutate(movable, "update", { id: 8, parentId: 7 });
    assert.equal(tooDeepMove.details.error, "parentId would exceed maximum task depth of 8");
    assert.deepEqual(tooDeepMove.state, movable);
  });

  it("keeps hierarchy and blockedBy cycle validation independent", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root" }).state;
    state = mutate(state, "create", { subject: "Child", parentId: 1, blockedBy: [1] }).state;
    state = mutate(state, "create", { subject: "Sibling child", parentId: 1 }).state;

    assert.deepEqual(state.tasks[1], {
      id: 2,
      subject: "Child",
      status: "pending",
      parentId: 1,
      blockedBy: [1]
    });
    const legalAncestorDependency = mutate(state, "update", { id: 1, addBlockedBy: [3] });
    assert.equal(legalAncestorDependency.details.error, undefined);

    const dependencyCycle = mutate(state, "update", { id: 1, addBlockedBy: [2] });
    assert.equal(
      dependencyCycle.details.error,
      "addBlockedBy would create a cycle in the blockedBy graph"
    );
    const hierarchyCycle = mutate(state, "update", { id: 1, parentId: 3 });
    assert.equal(hierarchyCycle.details.error, "parentId would create a cycle");
  });

  it("guards both tombstone paths and preserves deleted subtree placement", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root" }).state;
    state = mutate(state, "create", { subject: "Child", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Grandchild", parentId: 2 }).state;

    for (const rejected of [
      mutate(state, "delete", { id: 1 }),
      mutate(state, "update", { id: 1, status: "deleted" })
    ]) {
      assert.equal(rejected.details.error, "#1 has non-deleted descendant #2");
      assert.deepEqual(rejected.state, state);
      assert.deepEqual(rejected.details.tasks, state.tasks);
    }

    assert.equal(
      mutate(state, "update", { id: 2, parentId: null, status: "deleted" }).details.error,
      "parentId and status deleted must be separate updates"
    );

    state = mutate(state, "delete", { id: 3 }).state;
    state = mutate(state, "update", { id: 2, status: "deleted" }).state;
    state = mutate(state, "delete", { id: 1 }).state;
    assert.deepEqual(
      state.tasks.map((task) => ({ id: task.id, parentId: task.parentId, status: task.status })),
      [
        { id: 1, parentId: undefined, status: "deleted" },
        { id: 2, parentId: 1, status: "deleted" },
        { id: 3, parentId: 2, status: "deleted" }
      ]
    );
    const renamed = mutate(state, "update", { id: 2, subject: "Archived child" });
    assert.equal(renamed.details.error, undefined);
    assert.equal(renamed.state.tasks.find((task) => task.id === 2)?.parentId, 1);
    assert.equal(
      mutate(renamed.state, "update", { id: 2, parentId: null }).details.error,
      "#2 is deleted and cannot move"
    );
  });

  it("projects hierarchy-first lists, filtered paths, and immediate detail context", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root" }).state;
    state = mutate(state, "create", { subject: "First child", parentId: 1 }).state;
    state = mutate(state, "update", { id: 2, status: "in_progress" }).state;
    state = mutate(state, "create", { subject: "Second child", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Grandchild", parentId: 2 }).state;
    state = mutate(state, "update", { id: 4, status: "completed" }).state;
    state = mutate(state, "delete", { id: 3 }).state;

    assert.equal(
      mutate(state, "list", {}).content[0]?.text,
      ["[pending] #1 Root", "  [in_progress] #2 First child", "    [completed] #4 Grandchild"].join(
        "\n"
      )
    );
    assert.equal(
      mutate(state, "list", { status: "completed" }).content[0]?.text,
      "[completed] #4 Grandchild path: #1/#2"
    );
    assert.equal(
      mutate(state, "list", { includeDeleted: true }).content[0]?.text,
      [
        "[pending] #1 Root",
        "  [in_progress] #2 First child",
        "    [completed] #4 Grandchild",
        "  [deleted] #3 Second child"
      ].join("\n")
    );
    assert.equal(
      mutate(state, "get", { id: 1 }).content[0]?.text,
      ["#1 [pending] Root", "  children: #2"].join("\n")
    );
    assert.equal(
      mutate(state, "get", { id: 2 }).content[0]?.text,
      ["#2 [in_progress] First child", "  parent: #1", "  children: #4"].join("\n")
    );
  });

  it("rejects dependency cycles and reports reverse blocks", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "First" }).state;
    state = mutate(state, "create", { subject: "Second", blockedBy: [1] }).state;

    const cycle = mutate(state, "update", { id: 1, addBlockedBy: [2] });
    assert.equal(cycle.details.error, "addBlockedBy would create a cycle in the blockedBy graph");

    const got = mutate(state, "get", { id: 1 });
    assert.equal(got.content[0]?.text, ["#1 [pending] First", "  blocks: #2"].join("\n"));
  });
});
