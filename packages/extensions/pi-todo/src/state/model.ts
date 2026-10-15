import type { JsonObject, JsonValue, TextContent } from "@earendil-works/pi-ai";
import type { z } from "zod";

import type { mutationParamsSchema } from "../tool-schema.ts";

export const TASK_DETAILS_VERSION = 2;

export const TASK_STATUSES = ["pending", "in_progress", "completed", "deleted"] as const;

export const TASK_ACTIONS = ["create", "update", "list", "get", "delete", "clear"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskAction = (typeof TASK_ACTIONS)[number];

export type TaskMetadata = JsonObject;

export type Task = {
  id: number;
  subject: string;
  description?: string;
  inProgressLabel?: string;
  status: TaskStatus;
  parentId?: number;
  blockedBy?: number[];
  owner?: string;
  metadata?: TaskMetadata;
};

export type TodoState = {
  tasks: Task[];
  nextId: number;
};

export type TaskMutationParams = z.output<typeof mutationParamsSchema> & {
  [key: string]: JsonValue | undefined;
};

export type TaskDetails = {
  version?: 1 | 2;
  action: TaskAction;
  params: TaskMutationParams;
  tasks: Task[];
  nextId: number;
  error?: string;
};

export type TaskMutationResult = {
  state: TodoState;
  details: TaskDetails;
  content: TextContent[];
};
