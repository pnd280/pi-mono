import assert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_OVERHEAD_BYTES,
  MAX_LEGACY_SNAPSHOT_BYTES,
  MAX_LIST_LINES,
  MAX_OWNER_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS,
  TASK_DETAILS_VERSION
} from "./constants.ts";
import { applyTaskMutation as mutate, emptyTodoState } from "./reducer.ts";
import { parseTodoStateSnapshot } from "./session-state.ts";
import type { Task, TaskMutationParams, TodoState } from "./types.ts";

describe("todo reducer", () => {
  it("retains the complete snapshot when list content is bounded", () => {
    const omitted = 25;
    const taskCount = MAX_LIST_LINES + omitted;
    const state: TodoState = {
      tasks: Array.from({ length: taskCount }, (_, index) => ({
        id: index + 1,
        subject: `Todo ${index + 1}`,
        status: "pending" as const
      })),
      nextId: taskCount + 1
    };

    const listed = mutate(state, "list", {});
    assert.deepEqual(listed.details.tasks, state.tasks);
    assert.equal(listed.details.nextId, state.nextId);
    assert.equal(parseTodoStateSnapshot(listed.details)?.tasks.length, taskCount);
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

    assert.match(result.details.error ?? "", /subject.*characters/u);
    assert.deepEqual(result.details.params, { id: 1 });
    assert.deepEqual(result.details.tasks, state.tasks);
    assert.equal(result.details.nextId, state.nextId);
    assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= MAX_SNAPSHOT_BYTES);
  });

  it("does not version or mutate legacy state beyond current limits", () => {
    const legacyState: TodoState = {
      tasks: Array.from({ length: MAX_TASKS + 1 }, (_, index) => ({
        id: index + 1,
        subject: `Todo ${index + 1}`,
        status: "pending"
      })),
      nextId: MAX_TASKS + 2
    };

    const listed = mutate(legacyState, "list", {});
    assert.equal(listed.details.version, undefined);
    assert.equal(listed.details.tasks.length, legacyState.tasks.length);
    const updated = mutate(legacyState, "update", { id: 1, subject: "Changed" });
    assert.match(updated.details.error ?? "", /snapshot.*bytes/u);
    assert.deepEqual(updated.state, legacyState);
    assert.equal(updated.details.version, undefined);

    const cleared = mutate(legacyState, "clear", {});
    assert.equal(cleared.details.version, TASK_DETAILS_VERSION);
    assert.deepEqual(cleared.state, emptyTodoState());
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
    assert.equal(state.tasks.at(-1)?.parentId, 1);

    const missing = mutate(state, "update", { id: 99_999, status: "completed" });
    assert.match(missing.details.error ?? "", /#99999/u);
    const oversized = mutate(state, "create", {
      subject: "Too large",
      description: "d".repeat(MAX_DESCRIPTION_LENGTH)
    });
    assert.match(oversized.details.error ?? "", /snapshot.*bytes/u);

    for (const result of [missing, oversized, mutate(state, "list", {})]) {
      assert.deepEqual(result.state, state);
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
      if (action === "update") assert.match(result.details.error ?? "", /#99/u);
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

  it("preserves oversized legacy state even when each todo fits the current field limits", () => {
    const state: TodoState = {
      tasks: Array.from({ length: 200 }, (_, index) => ({
        id: index + 1,
        subject: "Todo",
        status: "pending",
        description: "d".repeat(MAX_DESCRIPTION_LENGTH)
      })),
      nextId: 201
    };
    assert.deepEqual(parseTodoStateSnapshot(state), state);
    const listed = mutate(state, "list", {});
    assert.equal(listed.details.error, undefined);
    const rejected = mutate(state, "update", { id: 1, subject: "Changed" });
    assert.match(rejected.details.error ?? "", /snapshot.*bytes/u);

    for (const result of [listed, rejected]) {
      assert.deepEqual(result.state, state);
      assert.equal(result.details.version, undefined);
      assert.deepEqual(parseTodoStateSnapshot(result.details), state);
    }
  });

  it("rejects invalid parents atomically on creation", () => {
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

    const deletedParent = mutate(state, "delete", { id: 7 }).state;

    for (const [parentId, diagnostic] of [
      [0, /parentId.*invalid/u],
      [1.5, /parentId.*invalid/u],
      [7, /#7.*deleted/u],
      [8, /#8.*itself/u],
      [99, /parentId.*#99/u]
    ] as const) {
      const rejected = mutate(deletedParent, "create", { subject: "Rejected", parentId });
      assert.match(rejected.details.error ?? "", diagnostic);
      assert.deepEqual(rejected.state, deletedParent);
      assert.deepEqual(rejected.details.tasks, deletedParent.tasks);
    }
  });

  it("rejects invalid reparenting atomically", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root one" }).state;
    state = mutate(state, "create", { subject: "Root two" }).state;
    state = mutate(state, "create", { subject: "Child one", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Child two", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Grandchild", parentId: 3 }).state;

    const deletedDestination = mutate(state, "delete", { id: 4 }).state;

    for (const [parentId, diagnostic] of [
      [0, /parentId.*invalid/u],
      [1.5, /parentId.*invalid/u],
      [3, /#3.*itself/u],
      [4, /#4.*deleted/u],
      [99, /parentId.*#99/u]
    ] as const) {
      const rejected = mutate(deletedDestination, "update", { id: 3, parentId });
      assert.match(rejected.details.error ?? "", diagnostic);
      assert.deepEqual(rejected.state, deletedDestination);
    }
  });

  it("rejects hierarchy cycles and depth overflow atomically at level eight", () => {
    let chain = emptyTodoState();

    for (let id = 1; id <= 8; id += 1) {
      const params: TaskMutationParams = { subject: `Level ${id}` };
      if (id > 1) params.parentId = id - 1;
      chain = mutate(chain, "create", params).state;
    }

    const tooDeepCreate = mutate(chain, "create", { subject: "Level 9", parentId: 8 });
    assert.match(tooDeepCreate.details.error ?? "", /parentId.*depth/u);
    assert.deepEqual(tooDeepCreate.state, chain);

    const cycle = mutate(chain, "update", { id: 1, parentId: 8, subject: "Not applied" });
    assert.match(cycle.details.error ?? "", /parentId.*cycle/u);
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
    assert.match(tooDeepMove.details.error ?? "", /parentId.*depth/u);
    assert.deepEqual(tooDeepMove.state, movable);
  });

  it("rejects both tombstone paths atomically for live descendants", () => {
    let state = emptyTodoState();
    state = mutate(state, "create", { subject: "Root" }).state;
    state = mutate(state, "create", { subject: "Child", parentId: 1 }).state;
    state = mutate(state, "create", { subject: "Grandchild", parentId: 2 }).state;

    for (const rejected of [
      mutate(state, "delete", { id: 1 }),
      mutate(state, "update", { id: 1, status: "deleted" })
    ]) {
      assert.match(rejected.details.error ?? "", /#1.*descendant.*#2/u);
      assert.deepEqual(rejected.state, state);
      assert.deepEqual(rejected.details.tasks, state.tasks);
    }
  });
});
