import { z } from "zod";

import { metadataLimitError } from "./limits.ts";
import { jsonMetadataSchema } from "./metadata.ts";
import { TASK_STATUSES } from "./types.ts";

export const mutationParamsSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  inProgressLabel: z.string().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  parentId: z.number().nullable().optional(),
  blockedBy: z.array(z.number()).optional(),
  addBlockedBy: z.array(z.number()).optional(),
  removeBlockedBy: z.array(z.number()).optional(),
  owner: z.string().optional(),
  id: z.number().optional(),
  includeDeleted: z.boolean().optional(),
  // Preflight before recursive Zod cloning, including for non-Pi direct callers.
  metadata: z
    .unknown()
    .refine((value) => metadataLimitError(value) === undefined)
    .pipe(jsonMetadataSchema)
    .optional()
});
