import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

/** The only text of a successful `compact` result. */
export const compactAcknowledgement = "Compaction requested.";

/** `compact` result details: the summary model and its thinking level appear together or not at all. */
export const compactDetailsSchema = z
  .object({
    scheduled: z.literal(true),
    modelOverride: modelReferenceSchema.optional(),
    thinkingLevel: z.enum(MODEL_THINKING_LEVELS).optional()
  })
  .refine(
    (details) => (details.modelOverride === undefined) === (details.thinkingLevel === undefined)
  );

export type CompactDetails = z.output<typeof compactDetailsSchema>;

/** `context_window` result details: Pi's context usage, unchanged. */
export const contextUsageSchema = z.object({
  tokens: z.number().nonnegative().nullable(),
  contextWindow: z.number().positive(),
  percent: z.number().nonnegative().nullable()
}) satisfies z.ZodType<ContextUsage>;
