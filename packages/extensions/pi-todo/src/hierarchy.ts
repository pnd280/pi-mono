import { MAX_TASK_DEPTH } from "./constants.ts";
import type { Task } from "./types.ts";

const ROOT_PARENT = null;

type ParentKey = number | typeof ROOT_PARENT;

export type TaskHierarchyEntry = {
  task: Task;
  depth: number;
  ancestorIds: readonly number[];
};

export type TaskTreeEntry = TaskHierarchyEntry & {
  ancestorHasFollowingSibling: readonly boolean[];
  isLastSibling: boolean;
};

export type TaskHierarchy = {
  tasksById: ReadonlyMap<number, Task>;
  childrenByParentId: ReadonlyMap<ParentKey, readonly Task[]>;
  entries: readonly TaskHierarchyEntry[];
  depthById: ReadonlyMap<number, number>;
};

type TraversalFrame = {
  task: Task;
  depth: number;
  ancestorIds: readonly number[];
  hasDeletedAncestor: boolean;
};

/**
 * Builds the source-ordered Task forest and rejects malformed relations. Callers
 * that render untrusted replacement state fail closed when this returns undefined.
 */
export function deriveTaskHierarchy(tasks: readonly Task[]): TaskHierarchy | undefined {
  const tasksById = indexTasks(tasks);
  if (!tasksById) return undefined;
  const childrenByParentId = groupChildrenByParent(tasks, tasksById);
  if (!childrenByParentId) return undefined;
  const traversal = traverseForest(tasks.length, childrenByParentId);
  if (!traversal) return undefined;

  return { tasksById, childrenByParentId, ...traversal };
}

function indexTasks(tasks: readonly Task[]): Map<number, Task> | undefined {
  const tasksById = new Map<number, Task>();

  for (const task of tasks) {
    if (!isTaskId(task.id) || tasksById.has(task.id)) return undefined;
    tasksById.set(task.id, task);
  }

  return tasksById;
}

function groupChildrenByParent(
  tasks: readonly Task[],
  tasksById: ReadonlyMap<number, Task>
): Map<ParentKey, Task[]> | undefined {
  const childrenByParentId = new Map<ParentKey, Task[]>();

  for (const task of tasks) {
    const parentId = task.parentId;

    if (
      parentId !== undefined &&
      (!isTaskId(parentId) || parentId === task.id || !tasksById.has(parentId))
    ) {
      return undefined;
    }

    const parentKey = parentId ?? ROOT_PARENT;
    const siblings = childrenByParentId.get(parentKey) ?? [];
    siblings.push(task);
    childrenByParentId.set(parentKey, siblings);
  }

  return childrenByParentId;
}

function traverseForest(
  taskCount: number,
  childrenByParentId: ReadonlyMap<ParentKey, readonly Task[]>
): Pick<TaskHierarchy, "entries" | "depthById"> | undefined {
  const entries: TaskHierarchyEntry[] = [];
  const depthById = new Map<number, number>();
  const visited = new Set<number>();
  const roots = childrenByParentId.get(ROOT_PARENT) ?? [];
  const stack: TraversalFrame[] = [];

  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const root = roots[index];
    if (root) stack.push({ task: root, depth: 1, ancestorIds: [], hasDeletedAncestor: false });
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) continue;

    if (
      visited.has(frame.task.id) ||
      frame.depth > MAX_TASK_DEPTH ||
      (frame.hasDeletedAncestor && frame.task.status !== "deleted")
    ) {
      return undefined;
    }

    visited.add(frame.task.id);
    depthById.set(frame.task.id, frame.depth);
    entries.push({
      task: frame.task,
      depth: frame.depth,
      ancestorIds: frame.ancestorIds
    });

    const children = childrenByParentId.get(frame.task.id) ?? [];
    const childAncestorIds = [...frame.ancestorIds, frame.task.id];
    const hasDeletedAncestor = frame.hasDeletedAncestor || frame.task.status === "deleted";

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];

      if (child) {
        stack.push({
          task: child,
          depth: frame.depth + 1,
          ancestorIds: childAncestorIds,
          hasDeletedAncestor
        });
      }
    }
  }

  return visited.size === taskCount ? { entries, depthById } : undefined;
}

export function projectTaskTreeEntries(
  entries: readonly TaskHierarchyEntry[],
  options: { hasTrailingRoot?: boolean } = {}
): readonly TaskTreeEntry[] {
  const tasksById = new Map(entries.map((entry) => [entry.task.id, entry.task]));
  const lastSiblingIdByParent = new Map<number | null, number>();

  for (const entry of entries) {
    lastSiblingIdByParent.set(entry.task.parentId ?? null, entry.task.id);
  }

  const hasFollowingSibling = (task: Task): boolean =>
    (task.parentId === undefined && options.hasTrailingRoot === true) ||
    lastSiblingIdByParent.get(task.parentId ?? null) !== task.id;

  return entries.map((entry) => ({
    ...entry,
    ancestorHasFollowingSibling: entry.ancestorIds.map((ancestorId) => {
      const ancestor = tasksById.get(ancestorId);

      return ancestor !== undefined && hasFollowingSibling(ancestor);
    }),
    isLastSibling: !hasFollowingSibling(entry.task)
  }));
}

export function orderedDirectChildren(hierarchy: TaskHierarchy, parentId: number): readonly Task[] {
  return hierarchy.childrenByParentId.get(parentId) ?? [];
}

export function subtreeTaskIds(hierarchy: TaskHierarchy, taskId: number): ReadonlySet<number> {
  const ids = new Set<number>();
  if (!hierarchy.tasksById.has(taskId)) return ids;

  const stack = [taskId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (currentId === undefined || ids.has(currentId)) continue;
    ids.add(currentId);
    const children = hierarchy.childrenByParentId.get(currentId) ?? [];
    for (const child of children) stack.push(child.id);
  }

  return ids;
}

/** Returns the subtree height with the requested Task as level 1. */
export function subtreeHeight(hierarchy: TaskHierarchy, taskId: number): number {
  if (!hierarchy.tasksById.has(taskId)) return 0;

  let maximumDepth = 0;
  const visited = new Set<number>();
  const stack = [{ taskId, depth: 1 }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame || visited.has(frame.taskId)) continue;
    visited.add(frame.taskId);
    maximumDepth = Math.max(maximumDepth, frame.depth);
    const children = hierarchy.childrenByParentId.get(frame.taskId) ?? [];
    for (const child of children) stack.push({ taskId: child.id, depth: frame.depth + 1 });
  }

  return maximumDepth;
}

function isTaskId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
