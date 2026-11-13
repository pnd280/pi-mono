import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { withCodemodeNotice } from "@pi-mono/libs/codemode-notice";

import type { TodoController } from "./state/controller.ts";
import type { TaskDetails } from "./state/model.ts";
import { TodoParamsSchema } from "./tool-schema.ts";

export function createTodoTool(controller: TodoController) {
  return withCodemodeNotice({
    name: "todo",
    exposure: "model-only",
    label: "Todos",
    description:
      "Manage a todo hierarchy. Hierarchy is organizational; statuses and dependencies are independent.",
    promptGuidelines: [
      "Use todo for multi-step or user-listed work; skip trivial work and chat-only requests.",
      "With todo, mark work in_progress before starting and completed immediately after finishing."
    ],
    executionMode: "sequential",
    parameters: TodoParamsSchema,
    async execute(_id, raw) {
      return controller.apply(raw);
    }
  } satisfies ToolDefinition<typeof TodoParamsSchema, TaskDetails>);
}
