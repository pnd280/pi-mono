import { z } from "zod";

import { deriveTaskHierarchy } from "./hierarchy.ts";
import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_OVERHEAD_BYTES,
  MAX_OWNER_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS
} from "./limits.ts";
import { serializedValueFitsLimit } from "./limits.ts";
import { jsonMetadataSchema } from "./metadata.ts";
import { TASK_DETAILS_VERSION, TASK_STATUSES, type TodoState } from "./model.ts";
import {
  cloneTask,
  emptyTodoState,
  hasDependencyCycle,
  stateFitsCurrentLimits
} from "./reducer.ts";

const taskStatusSchema = z.enum(TASK_STATUSES);
const taskIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const taskSchema = z.object({
  id: taskIdSchema,
  subject: z.string().max(MAX_SUBJECT_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  inProgressLabel: z.string().max(MAX_IN_PROGRESS_LABEL_LENGTH).optional(),
  status: taskStatusSchema,
  blockedBy: z.array(taskIdSchema).max(MAX_DEPENDENCIES).optional(),
  owner: z.string().max(MAX_OWNER_LENGTH).optional(),
  metadata: jsonMetadataSchema.optional(),
  parentId: taskIdSchema.optional()
});
const snapshotSchema = z.object({
  version: z.literal(TASK_DETAILS_VERSION),
  tasks: z.array(taskSchema).max(MAX_TASKS),
  nextId: taskIdSchema
});
const versionEnvelopeSchema = z.object({ version: z.literal(TASK_DETAILS_VERSION) });
const todoSnapshotEntrySchema = z.object({
  type: z.literal("message"),
  message: z.object({
    role: z.literal("toolResult"),
    toolName: z.literal("todo"),
    isError: z.literal(false).optional(),
    details: z.unknown()
  })
});

export function todoStateFromBranch<Entry>(entries: readonly Entry[]): TodoState {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const snapshot = parseTodoStateSnapshotEntry(entry);
    if (snapshot !== undefined) return snapshot;
  }

  return emptyTodoState();
}

export function parseTodoStateSnapshot<Value>(value: Value): TodoState | undefined {
  try {
    if (!versionEnvelopeSchema.safeParse(value).success) return undefined;

    // Keep this budgeted preflight ahead of Zod cloning and metadata traversal.
    if (!serializedValueFitsLimit(value, MAX_SNAPSHOT_BYTES + MAX_DETAILS_OVERHEAD_BYTES)) {
      return undefined;
    }

    const parsed = snapshotSchema.safeParse(value);
    if (!parsed.success) return undefined;
    const snapshot = { tasks: parsed.data.tasks, nextId: parsed.data.nextId };
    // Envelope headroom cannot become additional todo capacity on repeated replay.
    if (!serializedValueFitsLimit(snapshot, MAX_SNAPSHOT_BYTES)) return undefined;

    const state: TodoState = {
      tasks: snapshot.tasks.map(cloneTask),
      nextId: snapshot.nextId
    };

    // Sanitization can expand descriptions (tabs become spaces). Replayed state
    // must still meet the same limits as newly emitted snapshots.
    if (!stateFitsCurrentLimits(state)) return undefined;

    return isSemanticallyValidSnapshot(state) ? state : undefined;
  } catch {
    return undefined;
  }
}

function parseTodoStateSnapshotEntry<Entry>(entry: Entry): TodoState | undefined {
  try {
    // Replay scans the whole branch; skip other entries before the costlier schema parse.
    const message =
      typeof entry === "object" && entry !== null && "message" in entry ? entry.message : undefined;
    if (
      typeof message !== "object" ||
      message === null ||
      !("toolName" in message) ||
      message.toolName !== "todo"
    )
      return undefined;
    const parsed = todoSnapshotEntrySchema.safeParse(entry);
    if (!parsed.success) return undefined;

    return parseTodoStateSnapshot(parsed.data.message.details);
  } catch {
    return undefined;
  }
}

function isSemanticallyValidSnapshot(state: TodoState): boolean {
  const hierarchy = deriveTaskHierarchy(state.tasks);
  if (!hierarchy) return false;

  const highestTaskId = state.tasks.reduce((highest, task) => Math.max(highest, task.id), 0);
  if (state.nextId <= highestTaskId) return false;

  for (const task of state.tasks) {
    for (const dependency of task.blockedBy ?? []) {
      if (dependency === task.id || !hierarchy.tasksById.has(dependency)) return false;
    }
  }

  return !hasDependencyCycle(state.tasks);
}
