import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { TodoController } from "./state/controller.ts";
import type { TaskDetails } from "./state/model.ts";
import { TodoParamsSchema } from "./tool-schema.ts";

export function createTodoTool(controller: TodoController) {
  return {
    name: "todo",
    exposure: "model-only",
    label: "Todos",
    description:
      "Manage a todo hierarchy: create, update, list, get, delete (tombstone), clear. Hierarchy is organizational; statuses and dependencies are independent.",
    promptGuidelines: [
      "Use todo for work with 3+ steps or user-listed work; skip trivial work and chat-only requests.",
      "With todo, mark work in_progress before starting and completed immediately after finishing; keep only one todo in_progress at a time.",
      "Do not mark a todo completed while tests fail, work is partial, or errors remain; keep it in_progress and add a blocker todo."
    ],
    executionMode: "sequential",
    parameters: TodoParamsSchema,
    async execute(_id, raw) {
      return controller.apply(raw);
    }
  } satisfies ToolDefinition<typeof TodoParamsSchema, TaskDetails>;
}
