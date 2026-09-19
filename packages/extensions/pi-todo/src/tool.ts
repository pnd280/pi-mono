import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { TodoController } from "./controller.ts";
import { promptGuidelines } from "./guidelines.ts";
import { metadataLimitError } from "./limits.ts";
import { mutationParamsSchema } from "./mutation-schema.ts";
import { errorResult } from "./reducer.ts";
import { TodoParamsSchema } from "./tool-schema.ts";
import { TASK_ACTIONS, type TaskDetails } from "./types.ts";

const inputSchema = mutationParamsSchema.extend({ action: z.enum(TASK_ACTIONS) });

export function registerTodoTool(
  pi: { registerTool(definition: ReturnType<typeof createTodoTool>): void },
  controller: TodoController
): void {
  pi.registerTool(createTodoTool(controller));
}

export function createTodoTool(controller: TodoController) {
  return {
    name: "todo",
    label: "Tasks",
    description:
      "Manage a recursive Task hierarchy: create, update, list, get, delete (tombstone), clear. Hierarchy is organizational; statuses and dependencies are independent.",
    promptGuidelines,
    executionMode: "sequential",
    parameters: TodoParamsSchema,
    async execute(_id, raw) {
      const parsed = inputSchema.omit({ metadata: true }).safeParse(raw);
      if (!parsed.success) throw new Error("Invalid todo parameters");
      const { action, ...params } = parsed.data;

      if (raw.metadata !== undefined) {
        const limitError = metadataLimitError(raw.metadata);
        const metadata =
          limitError === undefined
            ? mutationParamsSchema.shape.metadata.safeParse(raw.metadata)
            : undefined;

        if (limitError !== undefined || !metadata?.success) {
          const result = errorResult(
            controller.getState(),
            action,
            params,
            limitError ?? "metadata must be JSON-serializable"
          );

          return { content: result.content, details: result.details };
        }

        const result = controller.apply(action, { ...params, metadata: metadata.data });

        return { content: result.content, details: result.details };
      }

      const result = controller.apply(action, params);

      return { content: result.content, details: result.details };
    }
  } satisfies ToolDefinition<typeof TodoParamsSchema, TaskDetails>;
}
