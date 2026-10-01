import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_LIST_CHARACTERS,
  MAX_LIST_LINES,
  MAX_OWNER_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_TASK_DEPTH,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS,
  TASK_DETAILS_VERSION
} from "./constants.ts";
import { deriveTaskHierarchy, subtreeHeight, type TaskHierarchyEntry } from "./hierarchy.ts";
import {
  metadataLimitError,
  serializedValueFitsLimit,
  snapshotDetailsFitLimit,
  snapshotFitsLimit
} from "./limits.ts";
import { sanitizeTaskDescription, sanitizeTaskMutationParams } from "./text.ts";
import {
  type Task,
  type TaskAction,
  type TaskDetails,
  type TaskMetadata,
  type TaskMutationParams,
  type TaskMutationResult,
  type TaskStatus,
  type TodoState
} from "./types.ts";

type TaskCloneSource = Pick<Task, "id" | "subject" | "status"> & {
  [Key in Exclude<keyof Task, "id" | "subject" | "status">]?: Task[Key] | undefined;
};

type BoundedStringParam = "subject" | "description" | "inProgressLabel" | "owner";

type DependencyArrayParam = "blockedBy" | "addBlockedBy" | "removeBlockedBy";

const KNOWN_PARAM_KEYS = [
  "subject",
  "description",
  "inProgressLabel",
  "status",
  "parentId",
  "blockedBy",
  "addBlockedBy",
  "removeBlockedBy",
  "owner",
  "metadata",
  "id",
  "includeDeleted"
] as const satisfies readonly (keyof TaskMutationParams)[];

type KnownTaskMutationParam = (typeof KNOWN_PARAM_KEYS)[number];

const VALID_TRANSITIONS = {
  pending: new Set<TaskStatus>(["in_progress", "completed", "deleted"]),
  in_progress: new Set<TaskStatus>(["pending", "completed", "deleted"]),
  completed: new Set<TaskStatus>(["deleted"]),
  deleted: new Set<TaskStatus>()
} satisfies Record<TaskStatus, ReadonlySet<TaskStatus>>;

export function emptyTodoState(): TodoState {
  return { tasks: [], nextId: 1 };
}

export function cloneTask(task: TaskCloneSource): Task {
  const cloned: Task = {
    id: task.id,
    subject: compactDisplayText(task.subject),
    status: task.status
  };

  if (task.description !== undefined) {
    cloned.description = sanitizeTaskDescription(task.description);
  }

  if (task.inProgressLabel !== undefined) {
    cloned.inProgressLabel = compactDisplayText(task.inProgressLabel);
  }

  if (task.parentId !== undefined) cloned.parentId = task.parentId;
  if (task.blockedBy !== undefined) cloned.blockedBy = [...task.blockedBy];
  if (task.owner !== undefined) cloned.owner = compactDisplayText(task.owner);
  if (task.metadata !== undefined) cloned.metadata = structuredClone(task.metadata);

  return cloned;
}

export function cloneState(state: TodoState): TodoState {
  return {
    tasks: state.tasks.map(cloneTask),
    nextId: state.nextId
  };
}

function isTransitionValid(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;

  return VALID_TRANSITIONS[from].has(to);
}

function detectCycle(
  taskList: readonly Task[],
  taskId: number,
  nextBlockedBy: readonly number[]
): boolean {
  const dependencies = new Map<number, readonly number[]>();

  for (const task of taskList) {
    dependencies.set(task.id, task.id === taskId ? nextBlockedBy : (task.blockedBy ?? []));
  }

  return dependencyGraphHasCycle(dependencies);
}

export function hasDependencyCycle(taskList: readonly Task[]): boolean {
  const dependencies = new Map<number, readonly number[]>();
  for (const task of taskList) dependencies.set(task.id, task.blockedBy ?? []);

  return dependencyGraphHasCycle(dependencies);
}

export function deriveBlocks(taskList: readonly Task[]): Map<number, number[]> {
  const blocks = new Map<number, number[]>();

  for (const task of taskList) {
    for (const dependency of task.blockedBy ?? []) {
      const blockedTasks = blocks.get(dependency) ?? [];
      blockedTasks.push(task.id);
      blocks.set(dependency, blockedTasks);
    }
  }

  return blocks;
}

function taskListResultText(taskList: readonly Task[], params: TaskMutationParams): string {
  const hierarchy = deriveTaskHierarchy(taskList);
  if (!hierarchy) return "No todos";

  const includeDeleted = params.includeDeleted === true;
  const statusFilter = params.status;
  const visibleEntries = hierarchy.entries.filter(
    ({ task }) =>
      (includeDeleted || task.status !== "deleted") &&
      (statusFilter === undefined || task.status === statusFilter)
  );

  if (visibleEntries.length === 0) return "No todos";

  return boundedListLines(visibleEntries, statusFilter).join("\n");
}

/** Bound model-facing list text; the result details still carry the full snapshot. */
function boundedListLines(
  entries: readonly TaskHierarchyEntry[],
  statusFilter: TaskStatus | undefined
): string[] {
  const lines: string[] = [];
  let characters = 0;

  for (const entry of entries) {
    if (lines.length >= MAX_LIST_LINES) break;
    const line = renderListEntry(entry, statusFilter);
    const separatorLength = lines.length > 0 ? 1 : 0;
    if (lines.length > 0 && characters + separatorLength + line.length > MAX_LIST_CHARACTERS) break;
    lines.push(line);
    characters += separatorLength + line.length;
  }

  let omitted = entries.length - lines.length;
  if (omitted === 0) return lines;
  let notice = omittedTasksNotice(omitted);

  // Keep the notice inside the same model-output budget. A legacy first line may
  // itself exceed the budget and is deliberately retained by contract.
  while (lines.length > 1 && characters + 1 + notice.length > MAX_LIST_CHARACTERS) {
    const removed = lines.pop();
    if (removed === undefined) break;
    characters -= removed.length + 1;
    omitted += 1;
    notice = omittedTasksNotice(omitted);
  }

  lines.push(notice);

  return lines;
}

function omittedTasksNotice(omitted: number): string {
  return `… ${omitted} more todos omitted (narrow with status or get #id)`;
}

function renderListEntry(entry: TaskHierarchyEntry, statusFilter: TaskStatus | undefined): string {
  const { task } = entry;
  const dependencies =
    task.blockedBy !== undefined && task.blockedBy.length > 0
      ? ` blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(",")}`
      : "";
  const inProgressLabel =
    task.status === "in_progress" && task.inProgressLabel
      ? ` (${compactDisplayText(task.inProgressLabel)})`
      : "";
  const prefix = statusFilter === undefined ? "  ".repeat(entry.depth - 1) : "";
  const path =
    statusFilter !== undefined && entry.ancestorIds.length > 0
      ? ` path: ${entry.ancestorIds.map((id) => `#${id}`).join("/")}`
      : "";

  return `${prefix}[${task.status}] #${task.id} ${compactDisplayText(task.subject)}${inProgressLabel}${dependencies}${path}`;
}

function taskDetailResultText(taskList: readonly Task[], task: Task): string {
  const blocks = deriveBlocks(taskList).get(task.id) ?? [];
  const hierarchy = deriveTaskHierarchy(taskList);
  const children = hierarchy
    ? (hierarchy.childrenByParentId.get(task.id) ?? []).filter(
        (child) => child.status !== "deleted"
      )
    : [];
  const lines = [`#${task.id} [${task.status}] ${compactDisplayText(task.subject)}`];
  if (task.parentId !== undefined) lines.push(`  parent: #${task.parentId}`);

  if (children.length > 0) {
    lines.push(`  children: ${children.map((child) => `#${child.id}`).join(", ")}`);
  }

  if (task.description) {
    lines.push(`  description: ${sanitizeTaskDescription(task.description)}`);
  }

  if (task.inProgressLabel) {
    lines.push(`  inProgressLabel: ${compactDisplayText(task.inProgressLabel)}`);
  }

  if (task.blockedBy !== undefined && task.blockedBy.length > 0) {
    lines.push(`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`);
  }

  if (blocks.length > 0) lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
  if (task.owner) lines.push(`  owner: ${compactDisplayText(task.owner)}`);

  return lines.join("\n");
}

function dependencyGraphHasCycle(
  dependenciesByTask: ReadonlyMap<number, readonly number[]>
): boolean {
  const visitState = new Map<number, "visiting" | "visited">();

  for (const startTaskId of dependenciesByTask.keys()) {
    if (visitState.has(startTaskId)) continue;

    const stack: Array<{ taskId: number; nextDependencyIndex: number }> = [
      { taskId: startTaskId, nextDependencyIndex: 0 }
    ];
    visitState.set(startTaskId, "visiting");

    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const dependencies = dependenciesByTask.get(frame.taskId) ?? [];
      const dependency = dependencies[frame.nextDependencyIndex];

      if (dependency === undefined) {
        visitState.set(frame.taskId, "visited");
        stack.pop();
        continue;
      }

      frame.nextDependencyIndex += 1;
      const dependencyState = visitState.get(dependency);
      if (dependencyState === "visiting") return true;
      if (dependencyState === "visited" || !dependenciesByTask.has(dependency)) continue;

      visitState.set(dependency, "visiting");
      stack.push({ taskId: dependency, nextDependencyIndex: 0 });
    }
  }

  return false;
}

function detailsFor(
  state: TodoState,
  action: TaskAction,
  params: TaskMutationParams,
  error?: string,
  offendingParam?: KnownTaskMutationParam
): TaskDetails {
  const baseDetails = {
    action,
    params: sanitizedParams(params, offendingParam),
    tasks: state.tasks.map(cloneTask),
    nextId: state.nextId
  } satisfies Omit<TaskDetails, "version" | "error">;

  if (stateFitsCurrentLimits(state)) {
    const details: TaskDetails = { version: TASK_DETAILS_VERSION, ...baseDetails };
    if (error !== undefined) details.error = error;
    // The structural check already sized the todo snapshot at this budget.
    if (snapshotDetailsFitLimit(details, MAX_SNAPSHOT_BYTES)) return details;
    throw new Error(`todo result snapshot exceeds ${MAX_SNAPSHOT_BYTES} serialized bytes`);
  }

  if (!state.tasks.some((task) => task.parentId !== undefined)) {
    const details: TaskDetails = { ...baseDetails };
    if (error !== undefined) details.error = error;
    if (snapshotFitsLimit(details)) return details;
  }

  throw new Error("todo result details cannot be emitted without losing hierarchy");
}

function minimalCurrentErrorDetails(
  state: TodoState,
  action: TaskAction,
  error: string
): TaskDetails {
  if (!stateFitsCurrentLimits(state)) {
    throw new Error("todo result details cannot be emitted as a valid version 2 snapshot");
  }

  const details: TaskDetails = {
    version: TASK_DETAILS_VERSION,
    action,
    params: {},
    tasks: state.tasks.map(cloneTask),
    nextId: state.nextId,
    error
  };

  if (!snapshotDetailsFitLimit(details, MAX_SNAPSHOT_BYTES)) {
    throw new Error("todo result details exceed the bounded version 2 emission ceiling");
  }

  return details;
}

export function errorResult(
  state: TodoState,
  action: TaskAction,
  params: TaskMutationParams,
  error: string,
  offendingParam?: KnownTaskMutationParam
): TaskMutationResult {
  let emittedError = error;
  let details: TaskDetails;

  try {
    details = detailsFor(state, action, params, error, offendingParam);
  } catch {
    emittedError = `result snapshot exceeds ${MAX_SNAPSHOT_BYTES} serialized bytes`;
    details = minimalCurrentErrorDetails(state, action, emittedError);
  }

  return {
    state,
    details,
    content: [{ type: "text", text: `Error: ${emittedError}` }]
  };
}

function unchangedResult(
  state: TodoState,
  action: TaskAction,
  params: TaskMutationParams,
  text: string
): TaskMutationResult {
  try {
    return {
      state,
      details: detailsFor(state, action, params),
      content: [{ type: "text", text }]
    };
  } catch {
    return errorResult(
      state,
      action,
      params,
      `result snapshot exceeds ${MAX_SNAPSHOT_BYTES} serialized bytes`
    );
  }
}

function mutationResult(
  previousState: TodoState,
  nextState: TodoState,
  action: TaskAction,
  params: TaskMutationParams,
  text: string
): TaskMutationResult {
  let details: TaskDetails;

  try {
    details = detailsFor(nextState, action, params);
  } catch {
    return errorResult(
      previousState,
      action,
      params,
      `result snapshot exceeds ${MAX_SNAPSHOT_BYTES} serialized bytes`
    );
  }

  if (details.version !== TASK_DETAILS_VERSION) {
    return errorResult(
      previousState,
      action,
      params,
      `result snapshot exceeds ${MAX_SNAPSHOT_BYTES} serialized bytes`
    );
  }

  return { state: nextState, details, content: [{ type: "text", text }] };
}

export function applyTaskMutation(
  state: TodoState,
  action: TaskAction,
  rawParams: TaskMutationParams
): TaskMutationResult {
  const params = sanitizeTaskMutationParams(rawParams);
  const ingressFailure = mutationParamsLimitError(params);

  if (ingressFailure !== undefined) {
    return errorResult(state, action, params, ingressFailure.error, ingressFailure.param);
  }

  switch (action) {
    case "create":
      return applyCreateTaskMutation(state, params);

    case "update":
      return applyUpdateTaskMutation(state, params);

    case "list":
      return unchangedResult(state, action, params, taskListResultText(state.tasks, params));

    case "get":
      return applyGetTaskMutation(state, params);

    case "delete":
      return applyDeleteTaskMutation(state, params);

    case "clear": {
      const count = state.tasks.length;
      const nextState = emptyTodoState();

      return mutationResult(state, nextState, action, params, `Cleared ${count} todos`);
    }
  }
}

type MutationValidation<Value> =
  | { ok: true; value: Value }
  | { ok: false; result: TaskMutationResult };

function applyCreateTaskMutation(state: TodoState, params: TaskMutationParams): TaskMutationResult {
  if (state.tasks.length >= MAX_TASKS) {
    return errorResult(state, "create", params, `todo limit of ${MAX_TASKS} reached`);
  }

  if (!isValidTaskId(state.nextId) || state.nextId >= Number.MAX_SAFE_INTEGER) {
    return errorResult(state, "create", params, "todo id limit reached");
  }

  if (!params.subject || !params.subject.trim()) {
    return errorResult(state, "create", params, "subject required for create");
  }

  const parent = validateCreatedParent(state, params);
  if (!parent.ok) return parent.result;
  const dependencyError = createDependencyError(state.tasks, params.blockedBy);

  if (dependencyError !== undefined) {
    return errorResult(state, "create", params, dependencyError);
  }

  const newTask = buildCreatedTask(state.nextId, params, parent.value);
  const nextState: TodoState = {
    tasks: [...state.tasks.map(cloneTask), newTask],
    nextId: state.nextId + 1
  };

  return mutationResult(
    state,
    nextState,
    "create",
    params,
    newTask.parentId === undefined
      ? `Created #${newTask.id}: ${newTask.subject} (pending)`
      : `Created #${newTask.id} under #${newTask.parentId}: ${newTask.subject} (pending)`
  );
}

function validateCreatedParent(
  state: TodoState,
  params: TaskMutationParams
): MutationValidation<number | undefined> {
  if (params.parentId === undefined || params.parentId === null) {
    return { ok: true, value: undefined };
  }

  if (!isValidTaskId(params.parentId)) {
    return {
      ok: false,
      result: errorResult(state, "create", params, `parentId: invalid todo id ${params.parentId}`)
    };
  }

  if (params.parentId === state.nextId) {
    return {
      ok: false,
      result: errorResult(state, "create", params, `cannot parent #${state.nextId} on itself`)
    };
  }

  const parent = state.tasks.find((task) => task.id === params.parentId);

  if (!parent) {
    return {
      ok: false,
      result: errorResult(state, "create", params, `parentId: #${params.parentId} not found`)
    };
  }

  if (parent.status === "deleted") {
    return {
      ok: false,
      result: errorResult(state, "create", params, `parentId: #${params.parentId} is deleted`)
    };
  }

  const hierarchy = deriveTaskHierarchy(state.tasks);
  const parentDepth = hierarchy?.depthById.get(parent.id);

  if (!hierarchy || parentDepth === undefined) {
    return {
      ok: false,
      result: errorResult(state, "create", params, "todo hierarchy is invalid")
    };
  }

  if (parentDepth >= MAX_TASK_DEPTH) {
    return {
      ok: false,
      result: errorResult(
        state,
        "create",
        params,
        `parentId would exceed maximum todo depth of ${MAX_TASK_DEPTH}`
      )
    };
  }

  return { ok: true, value: parent.id };
}

function createDependencyError(
  tasks: readonly Task[],
  blockedBy: readonly number[] | undefined
): string | undefined {
  if (!blockedBy || blockedBy.length === 0) return undefined;
  const invalidDependency = firstInvalidTaskId(blockedBy);

  if (invalidDependency !== undefined) {
    return `blockedBy: invalid todo id ${invalidDependency}`;
  }

  for (const dependency of blockedBy) {
    const dependencyTask = tasks.find((task) => task.id === dependency);
    if (!dependencyTask) return `blockedBy: #${dependency} not found`;
    if (dependencyTask.status === "deleted") return `blockedBy: #${dependency} is deleted`;
  }

  return undefined;
}

function buildCreatedTask(
  id: number,
  params: TaskMutationParams,
  parentId: number | undefined
): Task {
  const task: Task = { id, subject: params.subject ?? "", status: "pending" };
  if (parentId !== undefined) task.parentId = parentId;
  if (params.description) task.description = params.description;
  if (params.inProgressLabel) task.inProgressLabel = params.inProgressLabel;
  if (params.blockedBy && params.blockedBy.length > 0) task.blockedBy = [...params.blockedBy];
  if (params.owner) task.owner = params.owner;
  if (params.metadata) task.metadata = structuredClone(params.metadata);

  return task;
}

type ParentPlacement = {
  changed: boolean;
  parentId: number | undefined;
};

function applyUpdateTaskMutation(state: TodoState, params: TaskMutationParams): TaskMutationResult {
  if (params.id === undefined)
    return errorResult(state, "update", params, "id required for update");

  if (!isValidTaskId(params.id)) {
    return errorResult(state, "update", params, `invalid todo id ${params.id}`);
  }

  const index = state.tasks.findIndex((task) => task.id === params.id);
  const current = state.tasks[index];

  if (index === -1 || current === undefined) {
    return errorResult(state, "update", params, `#${params.id} not found`);
  }

  if (!hasUpdateMutation(params)) {
    return errorResult(state, "update", params, "update requires at least one mutable field");
  }

  if (params.parentId !== undefined && params.status === "deleted") {
    return errorResult(
      state,
      "update",
      params,
      "parentId and status deleted must be separate updates"
    );
  }

  let nextStatus = current.status;

  if (params.status !== undefined) {
    if (!isTransitionValid(current.status, params.status)) {
      return errorResult(
        state,
        "update",
        params,
        `illegal transition ${current.status} → ${params.status}`
      );
    }

    nextStatus = params.status;
  }

  const parent = validateUpdatedParent(state, current, params);
  if (!parent.ok) return parent.result;

  if (params.status === "deleted") {
    const descendantError = liveDescendantDeletionError(state.tasks, current.id);

    if (descendantError !== undefined) {
      return errorResult(state, "update", params, descendantError);
    }
  }

  const dependencies = validateUpdatedDependencies(state, current, params);
  if (!dependencies.ok) return dependencies.result;
  const metadata = validateUpdatedMetadata(state, current, params);
  if (!metadata.ok) return metadata.result;

  const updated = buildUpdatedTask(
    current,
    params,
    nextStatus,
    parent.value.parentId,
    dependencies.value,
    metadata.value
  );
  let nextTasks = state.tasks.map((task, taskIndex) =>
    taskIndex === index ? updated : cloneTask(task)
  );

  if (parent.value.changed) {
    nextTasks = nextTasks.filter((task) => task.id !== current.id);
    nextTasks.push(updated);
  }

  const nextState: TodoState = { tasks: nextTasks, nextId: state.nextId };
  const transition = current.status !== nextStatus ? ` (${current.status} → ${nextStatus})` : "";
  const destination =
    parent.value.parentId === undefined
      ? " (detached to root)"
      : ` (parent: #${parent.value.parentId})`;
  const placement = parent.value.changed ? destination : "";

  return mutationResult(
    state,
    nextState,
    "update",
    params,
    `Updated #${updated.id}${transition}${placement}`
  );
}

function hasUpdateMutation(params: TaskMutationParams): boolean {
  return (
    params.subject !== undefined ||
    params.description !== undefined ||
    params.inProgressLabel !== undefined ||
    params.status !== undefined ||
    params.parentId !== undefined ||
    params.owner !== undefined ||
    params.metadata !== undefined ||
    (params.addBlockedBy !== undefined && params.addBlockedBy.length > 0) ||
    (params.removeBlockedBy !== undefined && params.removeBlockedBy.length > 0)
  );
}

function validateUpdatedParent(
  state: TodoState,
  current: Task,
  params: TaskMutationParams
): MutationValidation<ParentPlacement> {
  if (params.parentId === undefined) {
    return { ok: true, value: { changed: false, parentId: current.parentId } };
  }

  if (current.status === "deleted") {
    return {
      ok: false,
      result: errorResult(state, "update", params, `#${current.id} is deleted and cannot move`)
    };
  }

  const parentId = params.parentId ?? undefined;

  if (parentId !== undefined && !isValidTaskId(parentId)) {
    return {
      ok: false,
      result: errorResult(state, "update", params, `parentId: invalid todo id ${parentId}`)
    };
  }

  if (parentId === current.parentId) {
    return { ok: true, value: { changed: false, parentId } };
  }

  if (parentId === current.id) {
    return {
      ok: false,
      result: errorResult(state, "update", params, `cannot parent #${current.id} on itself`)
    };
  }

  const hierarchy = deriveTaskHierarchy(state.tasks);

  if (!hierarchy) {
    return {
      ok: false,
      result: errorResult(state, "update", params, "todo hierarchy is invalid")
    };
  }

  if (parentId !== undefined) {
    const destination = hierarchy.tasksById.get(parentId);

    if (!destination) {
      return {
        ok: false,
        result: errorResult(state, "update", params, `parentId: #${parentId} not found`)
      };
    }

    if (destination.status === "deleted") {
      return {
        ok: false,
        result: errorResult(state, "update", params, `parentId: #${parentId} is deleted`)
      };
    }

    if (
      hierarchy.entries.some(
        (entry) => entry.task.id === parentId && entry.ancestorIds.includes(current.id)
      )
    ) {
      return {
        ok: false,
        result: errorResult(state, "update", params, "parentId would create a cycle")
      };
    }
  }

  const destinationDepth =
    parentId === undefined ? 1 : (hierarchy.depthById.get(parentId) ?? MAX_TASK_DEPTH + 1) + 1;
  const deepestMovedTaskDepth = destinationDepth + subtreeHeight(hierarchy, current.id) - 1;

  if (deepestMovedTaskDepth > MAX_TASK_DEPTH) {
    return {
      ok: false,
      result: errorResult(
        state,
        "update",
        params,
        `parentId would exceed maximum todo depth of ${MAX_TASK_DEPTH}`
      )
    };
  }

  return { ok: true, value: { changed: true, parentId } };
}

function liveDescendantDeletionError(tasks: readonly Task[], taskId: number): string | undefined {
  const hierarchy = deriveTaskHierarchy(tasks);
  if (!hierarchy) return "todo hierarchy is invalid";
  const liveDescendant = hierarchy.entries.find(
    (entry) => entry.ancestorIds.includes(taskId) && entry.task.status !== "deleted"
  );

  return liveDescendant
    ? `#${taskId} has non-deleted descendant #${liveDescendant.task.id}`
    : undefined;
}

function validateUpdatedDependencies(
  state: TodoState,
  current: Task,
  params: TaskMutationParams
): MutationValidation<number[]> {
  let nextBlockedBy = current.blockedBy ? [...current.blockedBy] : [];

  if (params.removeBlockedBy && params.removeBlockedBy.length > 0) {
    const invalidDependency = firstInvalidTaskId(params.removeBlockedBy);

    if (invalidDependency !== undefined) {
      return {
        ok: false,
        result: errorResult(
          state,
          "update",
          params,
          `removeBlockedBy: invalid todo id ${invalidDependency}`
        )
      };
    }

    const dependenciesToRemove = new Set(params.removeBlockedBy);
    nextBlockedBy = nextBlockedBy.filter((dependency) => !dependenciesToRemove.has(dependency));
  }

  if (!params.addBlockedBy || params.addBlockedBy.length === 0) {
    return { ok: true, value: nextBlockedBy };
  }

  const invalidDependency = firstInvalidTaskId(params.addBlockedBy);

  if (invalidDependency !== undefined) {
    return {
      ok: false,
      result: errorResult(
        state,
        "update",
        params,
        `addBlockedBy: invalid todo id ${invalidDependency}`
      )
    };
  }

  for (const dependency of params.addBlockedBy) {
    const error = addedDependencyError(state.tasks, current.id, dependency);

    if (error !== undefined) {
      return { ok: false, result: errorResult(state, "update", params, error) };
    }

    if (!nextBlockedBy.includes(dependency)) nextBlockedBy.push(dependency);
  }

  if (detectCycle(state.tasks, current.id, nextBlockedBy)) {
    return {
      ok: false,
      result: errorResult(
        state,
        "update",
        params,
        "addBlockedBy would create a cycle in the blockedBy graph"
      )
    };
  }

  return { ok: true, value: nextBlockedBy };
}

function addedDependencyError(
  tasks: readonly Task[],
  currentId: number,
  dependency: number
): string | undefined {
  if (dependency === currentId) return `cannot block #${currentId} on itself`;
  const dependencyTask = tasks.find((task) => task.id === dependency);
  if (!dependencyTask) return `addBlockedBy: #${dependency} not found`;

  return dependencyTask.status === "deleted"
    ? `addBlockedBy: #${dependency} is deleted`
    : undefined;
}

function validateUpdatedMetadata(
  state: TodoState,
  current: Task,
  params: TaskMutationParams
): MutationValidation<TaskMetadata | undefined> {
  if (params.metadata === undefined) return { ok: true, value: current.metadata };
  const mergedMetadata: TaskMetadata = { ...current.metadata };

  for (const [key, value] of Object.entries(params.metadata)) {
    if (value === null) delete mergedMetadata[key];
    // Preserve a model-supplied "__proto__" as metadata rather than mutating this map's prototype.
    else
      Object.defineProperty(mergedMetadata, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true
      });
  }

  const metadataError = metadataLimitError(mergedMetadata);

  if (metadataError !== undefined) {
    return {
      ok: false,
      result: errorResult(state, "update", params, metadataError, "metadata")
    };
  }

  return {
    ok: true,
    value: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined
  };
}

function buildUpdatedTask(
  current: Task,
  params: TaskMutationParams,
  status: TaskStatus,
  parentId: number | undefined,
  blockedBy: number[],
  metadata: TaskMetadata | undefined
): Task {
  const updated = cloneTask({
    ...current,
    status,
    parentId,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    metadata
  });
  if (params.subject !== undefined) updated.subject = params.subject;
  if (params.description !== undefined) updated.description = params.description;
  if (params.inProgressLabel !== undefined) updated.inProgressLabel = params.inProgressLabel;
  if (params.owner !== undefined) updated.owner = params.owner;

  return updated;
}

function applyGetTaskMutation(state: TodoState, params: TaskMutationParams): TaskMutationResult {
  if (params.id === undefined) return errorResult(state, "get", params, "id required for get");

  if (!isValidTaskId(params.id)) {
    return errorResult(state, "get", params, `invalid todo id ${params.id}`);
  }

  const task = state.tasks.find((candidate) => candidate.id === params.id);
  if (!task) return errorResult(state, "get", params, `#${params.id} not found`);

  return unchangedResult(state, "get", params, taskDetailResultText(state.tasks, task));
}

function applyDeleteTaskMutation(state: TodoState, params: TaskMutationParams): TaskMutationResult {
  if (params.id === undefined)
    return errorResult(state, "delete", params, "id required for delete");

  if (!isValidTaskId(params.id)) {
    return errorResult(state, "delete", params, `invalid todo id ${params.id}`);
  }

  const index = state.tasks.findIndex((task) => task.id === params.id);
  const current = state.tasks[index];

  if (index === -1 || current === undefined) {
    return errorResult(state, "delete", params, `#${params.id} not found`);
  }

  if (current.status === "deleted") {
    return errorResult(state, "delete", params, `#${current.id} is already deleted`);
  }

  const descendantError = liveDescendantDeletionError(state.tasks, current.id);

  if (descendantError !== undefined) {
    return errorResult(state, "delete", params, descendantError);
  }

  const updated: Task = { ...cloneTask(current), status: "deleted" };
  const nextTasks = state.tasks.map((task, taskIndex) =>
    taskIndex === index ? updated : cloneTask(task)
  );
  const nextState: TodoState = { tasks: nextTasks, nextId: state.nextId };

  return mutationResult(
    state,
    nextState,
    "delete",
    params,
    `Deleted #${updated.id}: ${updated.subject}`
  );
}

export function stateFitsCurrentLimits(state: TodoState): boolean {
  if (state.tasks.length > MAX_TASKS || !isValidTaskId(state.nextId)) return false;

  for (const task of state.tasks) {
    if (
      !isValidTaskId(task.id) ||
      (task.parentId !== undefined && !isValidTaskId(task.parentId)) ||
      task.subject.length > MAX_SUBJECT_LENGTH ||
      (task.description !== undefined && task.description.length > MAX_DESCRIPTION_LENGTH) ||
      (task.inProgressLabel !== undefined &&
        task.inProgressLabel.length > MAX_IN_PROGRESS_LABEL_LENGTH) ||
      (task.owner !== undefined && task.owner.length > MAX_OWNER_LENGTH) ||
      (task.blockedBy !== undefined &&
        (task.blockedBy.length > MAX_DEPENDENCIES ||
          task.blockedBy.some((dependency) => !isValidTaskId(dependency)))) ||
      (task.metadata !== undefined && metadataLimitError(task.metadata) !== undefined)
    ) {
      return false;
    }
  }

  return (
    deriveTaskHierarchy(state.tasks) !== undefined &&
    serializedValueFitsLimit({ tasks: state.tasks, nextId: state.nextId }, MAX_SNAPSHOT_BYTES)
  );
}

function mutationParamsLimitError(
  params: TaskMutationParams
): { error: string; param: KnownTaskMutationParam } | undefined {
  const boundedStrings: Array<
    [name: BoundedStringParam, value: string | undefined, maximum: number]
  > = [
    ["subject", params.subject, MAX_SUBJECT_LENGTH],
    ["description", params.description, MAX_DESCRIPTION_LENGTH],
    ["inProgressLabel", params.inProgressLabel, MAX_IN_PROGRESS_LABEL_LENGTH],
    ["owner", params.owner, MAX_OWNER_LENGTH]
  ];

  for (const [name, value, maximum] of boundedStrings) {
    if (value !== undefined && value.length > maximum) {
      return {
        error: `${name} exceeds ${maximum} characters`,
        param: name
      };
    }
  }

  const dependencyArrays: Array<[name: DependencyArrayParam, value: number[] | undefined]> = [
    ["blockedBy", params.blockedBy],
    ["addBlockedBy", params.addBlockedBy],
    ["removeBlockedBy", params.removeBlockedBy]
  ];

  for (const [name, value] of dependencyArrays) {
    if (value !== undefined && value.length > MAX_DEPENDENCIES) {
      return {
        error: `${name} exceeds ${MAX_DEPENDENCIES} todo ids`,
        param: name
      };
    }
  }

  if (params.metadata === undefined) return undefined;
  const metadataError = metadataLimitError(params.metadata);

  return metadataError === undefined ? undefined : { error: metadataError, param: "metadata" };
}

function sanitizedParams(
  params: TaskMutationParams,
  offendingParam?: KnownTaskMutationParam
): TaskMutationParams {
  const sanitized: TaskMutationParams = {};

  for (const key of KNOWN_PARAM_KEYS) {
    const value = params[key];

    if (key !== offendingParam && value !== undefined && paramFitsEmissionLimit(key, value)) {
      let independentValue = value;
      if (key === "metadata") independentValue = structuredClone(value);
      else if (Array.isArray(value)) independentValue = [...value];
      Object.assign(sanitized, { [key]: independentValue });
    }
  }

  return sanitized;
}

function paramFitsEmissionLimit<Value>(key: KnownTaskMutationParam, value: Value): boolean {
  switch (key) {
    case "subject":
      return typeof value === "string" && value.length <= MAX_SUBJECT_LENGTH;
    case "description":
      return typeof value === "string" && value.length <= MAX_DESCRIPTION_LENGTH;
    case "inProgressLabel":
      return typeof value === "string" && value.length <= MAX_IN_PROGRESS_LABEL_LENGTH;
    case "owner":
      return typeof value === "string" && value.length <= MAX_OWNER_LENGTH;
    case "blockedBy":
    case "addBlockedBy":
    case "removeBlockedBy":
      return Array.isArray(value) && value.length <= MAX_DEPENDENCIES;
    case "metadata":
      return metadataFitsEmissionLimit(value);
    case "status":
      return typeof value === "string";
    case "id":
      return typeof value === "number";
    case "parentId":
      return value === null || typeof value === "number";
    case "includeDeleted":
      return typeof value === "boolean";
  }
}

function metadataFitsEmissionLimit(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    metadataLimitError(value) === undefined
  );
}

function isValidTaskId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function firstInvalidTaskId(values: readonly number[]): number | undefined {
  return values.find((value) => !isValidTaskId(value));
}
