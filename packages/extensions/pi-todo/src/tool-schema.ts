import { StringEnum, Type, type Static } from "@earendil-works/pi-ai";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_OWNER_LENGTH,
  MAX_SUBJECT_LENGTH
} from "./constants.ts";
import { TASK_ACTIONS, TASK_STATUSES } from "./types.ts";

export const TodoParamsSchema = Type.Object(
  {
    action: StringEnum(TASK_ACTIONS),
    subject: Type.Optional(
      Type.String({
        description: "Task subject line (required for create)",
        maxLength: MAX_SUBJECT_LENGTH
      })
    ),
    description: Type.Optional(
      Type.String({ description: "Long-form task description", maxLength: MAX_DESCRIPTION_LENGTH })
    ),
    inProgressLabel: Type.Optional(
      Type.String({
        description:
          "Present-continuous activity label shown while status is in_progress (e.g. 'writing tests')",
        maxLength: MAX_IN_PROGRESS_LABEL_LENGTH
      })
    ),
    status: Type.Optional(
      StringEnum(TASK_STATUSES, {
        description: "Target status (update) or list filter (list)"
      })
    ),
    parentId: Type.Optional(
      Type.Unsafe<number | null>({
        type: ["integer", "null"],
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
        description:
          "Parent Task id. On create, omit/null for a root or provide a live parent id. On update, omit to keep, provide an id to reparent, or null to detach."
      })
    ),
    blockedBy: Type.Optional(
      Type.Array(Type.Number(), {
        description: "Initial blockedBy ids (create only)",
        maxItems: MAX_DEPENDENCIES
      })
    ),
    addBlockedBy: Type.Optional(
      Type.Array(Type.Number(), {
        description: "Task ids to add to blockedBy (update only, additive merge)",
        maxItems: MAX_DEPENDENCIES
      })
    ),
    removeBlockedBy: Type.Optional(
      Type.Array(Type.Number(), {
        description: "Task ids to remove from blockedBy (update only, additive merge)",
        maxItems: MAX_DEPENDENCIES
      })
    ),
    owner: Type.Optional(
      Type.String({
        description: "Agent/owner assigned to this task",
        maxLength: MAX_OWNER_LENGTH
      })
    ),
    metadata: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Arbitrary metadata; pass null value for a key to delete that key on update"
      })
    ),
    id: Type.Optional(
      Type.Number({
        description: "Task id (required for update, get, delete)"
      })
    ),
    includeDeleted: Type.Optional(
      Type.Boolean({
        description:
          "If true, list action returns deleted (tombstoned) tasks as well. Default: false."
      })
    )
  },
  { additionalProperties: false }
);

export type TodoParams = Static<typeof TodoParamsSchema>;
