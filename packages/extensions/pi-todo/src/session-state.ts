import { z } from "zod";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_OVERHEAD_BYTES,
  MAX_LEGACY_SNAPSHOT_BYTES,
  MAX_LEGACY_TASKS,
  MAX_OWNER_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TASKS,
  TASK_DETAILS_VERSION
} from "./constants.ts";
import { deriveTaskHierarchy } from "./hierarchy.ts";
import { metadataLimitError, serializedSnapshotFitsLimit } from "./limits.ts";
import { jsonMetadataSchema } from "./metadata.ts";
import { cloneState, cloneTask, emptyTodoState, hasDependencyCycle } from "./reducer.ts";
import { TASK_STATUSES, type Task, type TodoState } from "./types.ts";

const taskStatusSchema = z.enum(TASK_STATUSES);
const taskIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const legacyTaskSchema = z.object({
  id: taskIdSchema,
  subject: z.string(),
  description: z.string().optional(),
  inProgressLabel: z.string().optional(),
  status: taskStatusSchema,
  blockedBy: z.array(taskIdSchema).optional(),
  owner: z.string().optional(),
  metadata: jsonMetadataSchema.optional()
});
const versionOneTaskSchema = legacyTaskSchema.extend({
  subject: z.string().max(MAX_SUBJECT_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  inProgressLabel: z.string().max(MAX_IN_PROGRESS_LABEL_LENGTH).optional(),
  blockedBy: z.array(taskIdSchema).max(MAX_DEPENDENCIES).optional(),
  owner: z.string().max(MAX_OWNER_LENGTH).optional()
});
const versionTwoTaskSchema = versionOneTaskSchema.extend({
  parentId: taskIdSchema.optional()
});
const legacySnapshotSchema = z.object({
  tasks: z.array(legacyTaskSchema).max(MAX_LEGACY_TASKS),
  nextId: taskIdSchema
});
const versionOneSnapshotSchema = z.object({
  version: z.literal(1),
  tasks: z.array(versionOneTaskSchema).max(MAX_TASKS),
  nextId: taskIdSchema
});
const versionTwoSnapshotSchema = z.object({
  version: z.literal(TASK_DETAILS_VERSION),
  tasks: z.array(versionTwoTaskSchema).max(MAX_TASKS),
  nextId: taskIdSchema
});
const versionEnvelopeSchema = z.object({
  version: z.union([z.literal(1), z.literal(TASK_DETAILS_VERSION)]).optional()
});
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
  const version = detailsVersion(value);
  if (version === "unknown") return undefined;

  const current = version !== undefined;
  const maximumBytes = current ? MAX_SNAPSHOT_BYTES : MAX_LEGACY_SNAPSHOT_BYTES;
  // Keep this budgeted preflight ahead of Zod cloning and metadata traversal.
  if (!serializedSnapshotFitsLimit(value, maximumBytes + MAX_DETAILS_OVERHEAD_BYTES))
    return undefined;

  try {
    const schemas = {
      legacy: legacySnapshotSchema,
      1: versionOneSnapshotSchema,
      2: versionTwoSnapshotSchema
    };
    const parsed = schemas[version ?? "legacy"].safeParse(value);
    if (!parsed.success) return undefined;
    const snapshot = { tasks: parsed.data.tasks, nextId: parsed.data.nextId };
    // Envelope headroom cannot become additional task capacity on repeated replay.
    if (!serializedSnapshotFitsLimit(snapshot, maximumBytes)) return undefined;

    const state: TodoState = {
      tasks: snapshot.tasks.map(cloneTask),
      nextId: snapshot.nextId
    };

    if (
      current &&
      !state.tasks.every(
        (task) => task.metadata === undefined || !metadataLimitError(task.metadata)
      )
    ) {
      return undefined;
    }

    return isSemanticallyValidSnapshot(state) ? state : undefined;
  } catch {
    return undefined;
  }
}

function parseTodoStateSnapshotEntry<Entry>(entry: Entry): TodoState | undefined {
  try {
    const parsed = todoSnapshotEntrySchema.safeParse(entry);
    if (!parsed.success) return undefined;

    const snapshot = parseTodoStateSnapshot(parsed.data.message.details);

    return snapshot ? cloneState(snapshot) : undefined;
  } catch {
    return undefined;
  }
}

function detailsVersion<Value>(value: Value): 1 | 2 | undefined | "unknown" {
  try {
    const parsed = versionEnvelopeSchema.safeParse(value);
    if (!parsed.success) return "unknown";

    return parsed.data.version;
  } catch {
    return "unknown";
  }
}

function isSemanticallyValidSnapshot(state: TodoState): boolean {
  const tasksById = new Map<number, Task>();

  for (const task of state.tasks) {
    if (tasksById.has(task.id)) return false;
    tasksById.set(task.id, task);
  }

  const highestTaskId = state.tasks.reduce((highest, task) => Math.max(highest, task.id), 0);
  if (state.nextId <= highestTaskId) return false;

  for (const task of state.tasks) {
    for (const dependency of task.blockedBy ?? []) {
      if (dependency === task.id || !tasksById.has(dependency)) return false;
    }
  }

  return deriveTaskHierarchy(state.tasks) !== undefined && !hasDependencyCycle(state.tasks);
}
