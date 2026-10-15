import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

export const toolInputSchema = z.strictObject({
  delivery: z
    .enum(["follow_up", "steer"])
    .optional()
    .describe(
      "For input to an active task. follow_up (default) waits until the current work finishes; steer arrives before the next atomic action."
    ),
  background: z
    .boolean()
    .optional()
    .describe(
      "Run independent work in the background and receive its result automatically. Do not sleep or poll."
    ),
  description: z.string().min(1).describe("A short (3 to 5 words) label for the task."),
  prompt: z
    .string()
    .min(1)
    .describe(
      "The detailed task for the child to perform, or new input for an existing conversation."
    ),
  task_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The full ID of a task you own. Resume inactive tasks or send input to active tasks. Active-task updates return immediately."
    ),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "A provider/id model. Defaults to the task's previously requested model on resume, and to your current model otherwise."
    ),
  thinking: z
    .enum(MODEL_THINKING_LEVELS)
    .optional()
    .describe(
      "Defaults to the task's previously requested level on resume, and to your current level otherwise."
    )
});

export type ToolInput = z.infer<typeof toolInputSchema>;

export const toolParameters = toToolSchema(toolInputSchema);

export const abortInputSchema = z.strictObject({
  task_id: z.string().min(1).describe("The full ID of an active task you own.")
});

export type AbortInput = z.infer<typeof abortInputSchema>;

export const abortParameters = toToolSchema(abortInputSchema);
