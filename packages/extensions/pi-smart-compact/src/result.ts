import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

/** The only text of a successful `compact` result. */
export const compactAcknowledgement = "Compaction requested.";

/** `compact` result details: the summary model and its thinking level appear together or not at all. */
export const compactDetailsSchema = z.union([
  z.object({
    scheduled: z.literal(true),
    modelOverride: modelReferenceSchema,
    thinkingLevel: z.enum(MODEL_THINKING_LEVELS)
  }),
  z.object({
    scheduled: z.literal(true),
    modelOverride: z.undefined().optional(),
    thinkingLevel: z.undefined().optional()
  })
]);

export type CompactDetails = z.output<typeof compactDetailsSchema>;

/** `context_window` result details: Pi's context usage, unchanged. */
export const contextUsageSchema = z.object({
  tokens: z.number().nonnegative().nullable(),
  contextWindow: z.number().positive(),
  percent: z.number().nonnegative().nullable()
}) satisfies z.ZodType<ContextUsage>;

/** The custom message that reports context usage to the model when usage passes a `statusStep` boundary. */
export const contextStatusType = "pi-smart-compact.context-usage";

/** Context status details: the reported usage, the conversation model, and the model whose response supplied the count, absent while no response on the branch has usage. Only the usage is in the message text. Both models are `provider/id` as Pi names them, which the settings reference pattern can reject. */
export const contextStatusSchema = contextUsageSchema.extend({
  tokens: z.number().nonnegative(),
  percent: z.number().nonnegative(),
  model: z.string(),
  countedBy: z.string().optional()
});

export type ContextStatusDetails = z.output<typeof contextStatusSchema>;
