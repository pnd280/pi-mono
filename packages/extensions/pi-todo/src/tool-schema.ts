import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

import {
  MAX_IN_PROGRESS_LABEL_LENGTH,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_OWNER_LENGTH,
  MAX_SUBJECT_LENGTH
} from "./state/limits.ts";
import { jsonMetadataSchema } from "./state/metadata.ts";
import { TASK_ACTIONS, TASK_STATUSES } from "./state/model.ts";

const fields = {
  subject: z.string().describe("Todo subject line (required for create)"),
  description: z.string().describe("Long-form todo description"),
  inProgressLabel: z
    .string()
    .describe(
      "Present-continuous activity label shown while status is in_progress (e.g. 'writing tests')"
    ),
  status: z.enum(TASK_STATUSES).describe("Target status (update) or list filter (list)"),
  parentId: z
    .number()
    .nullable()
    .describe(
      "Parent todo ID (positive safe integer). On create, omit or use null for a root, or provide a live parent ID. On update, omit to keep the parent, provide an ID to reparent, or use null to detach."
    ),
  blockedBy: z.array(z.number()).describe("Initial blockedBy IDs (create only)"),
  addBlockedBy: z
    .array(z.number())
    .describe("Todo IDs to add to blockedBy (update only, additive merge)"),
  removeBlockedBy: z
    .array(z.number())
    .describe("Todo IDs to remove from blockedBy (update only, additive merge)"),
  owner: z.string().describe("Agent/owner assigned to this todo"),
  metadata: jsonMetadataSchema.describe(
    "Arbitrary metadata; pass null value for a key to delete that key on update"
  ),
  id: z.number().describe("Todo ID (required for update, get, delete)"),
  includeDeleted: z
    .boolean()
    .describe("If true, list action returns deleted (tombstoned) todos as well. Default: false.")
};

/** Raw/domain fields retain values whose rejection needs a replayable domain result. */
export const mutationParamsSchema = z.object(fields).partial();

/** Metadata must pass the budgeted preflight before its recursive JSON parser runs. */
export const todoInputSchema = mutationParamsSchema
  .omit({ metadata: true })
  .extend({ action: z.enum(TASK_ACTIONS) });

// The model view shares field names and descriptions, but bounds inputs and projects metadata.
const modelFields = z
  .object({
    ...fields,
    subject: fields.subject.max(MAX_SUBJECT_LENGTH).meta(fields.subject.meta() ?? {}),
    description: fields.description
      .max(MAX_DESCRIPTION_LENGTH)
      .meta(fields.description.meta() ?? {}),
    inProgressLabel: fields.inProgressLabel
      .max(MAX_IN_PROGRESS_LABEL_LENGTH)
      .meta(fields.inProgressLabel.meta() ?? {}),
    parentId: z
      .int()
      .min(1)
      .nullable()
      .meta(fields.parentId.meta() ?? {}),
    blockedBy: fields.blockedBy.max(MAX_DEPENDENCIES).meta(fields.blockedBy.meta() ?? {}),
    addBlockedBy: fields.addBlockedBy.max(MAX_DEPENDENCIES).meta(fields.addBlockedBy.meta() ?? {}),
    removeBlockedBy: fields.removeBlockedBy
      .max(MAX_DEPENDENCIES)
      .meta(fields.removeBlockedBy.meta() ?? {}),
    owner: fields.owner.max(MAX_OWNER_LENGTH).meta(fields.owner.meta() ?? {}),
    metadata: z.record(z.string(), z.unknown()).meta(fields.metadata.meta() ?? {})
  })
  .partial();

export const TodoParamsSchema = toToolSchema(
  z.strictObject({ action: z.enum(TASK_ACTIONS), ...modelFields.shape })
);
