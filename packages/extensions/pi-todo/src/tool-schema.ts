import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_OWNER_LENGTH,
  MAX_SUBJECT_LENGTH
} from "./constants.ts";
import { TASK_ACTIONS, TASK_STATUSES } from "./types.ts";

export const TodoParamsSchema = toToolSchema(
  z.strictObject({
    action: z.enum(TASK_ACTIONS),
    subject: z
      .string()
      .max(MAX_SUBJECT_LENGTH)
      .optional()
      .describe("Todo subject line (required for create)"),
    description: z
      .string()
      .max(MAX_DESCRIPTION_LENGTH)
      .optional()
      .describe("Long-form todo description"),
    inProgressLabel: z
      .string()
      .max(MAX_IN_PROGRESS_LABEL_LENGTH)
      .optional()
      .describe(
        "Present-continuous activity label shown while status is in_progress (e.g. 'writing tests')"
      ),
    status: z
      .enum(TASK_STATUSES)
      .optional()
      .describe("Target status (update) or list filter (list)"),
    parentId: z
      .int()
      .min(1)
      .nullable()
      .optional()
      .describe(
        "Parent todo ID (positive safe integer). On create, omit or use null for a root, or provide a live parent ID. On update, omit to keep the parent, provide an ID to reparent, or use null to detach."
      ),
    blockedBy: z
      .array(z.number())
      .max(MAX_DEPENDENCIES)
      .optional()
      .describe("Initial blockedBy IDs (create only)"),
    addBlockedBy: z
      .array(z.number())
      .max(MAX_DEPENDENCIES)
      .optional()
      .describe("Todo IDs to add to blockedBy (update only, additive merge)"),
    removeBlockedBy: z
      .array(z.number())
      .max(MAX_DEPENDENCIES)
      .optional()
      .describe("Todo IDs to remove from blockedBy (update only, additive merge)"),
    owner: z
      .string()
      .max(MAX_OWNER_LENGTH)
      .optional()
      .describe("Agent/owner assigned to this todo"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arbitrary metadata; pass null value for a key to delete that key on update"),
    id: z.number().optional().describe("Todo ID (required for update, get, delete)"),
    includeDeleted: z
      .boolean()
      .optional()
      .describe("If true, list action returns deleted (tombstoned) todos as well. Default: false.")
  })
);
