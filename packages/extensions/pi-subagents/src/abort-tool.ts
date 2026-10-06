import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { formatTaskEnvelope } from "@pi-mono/utils/task-envelope";
import { subagentAbortDisplayAdapter } from "pi-tool-display/adapters";

import type { Delivery } from "./delivery.ts";
import { createRenderers, type CardState } from "./render.ts";
import { detailsUsage, type ToolDetails } from "./result.ts";
import type { Tasks } from "./tasks.ts";
import { abortInputSchema, abortParameters, type AbortInput } from "./tool-schema.ts";

export const ABORT_REASON = "Cancelled by supervisor";

export function createAbortTool(
  tasks: Tasks,
  delivery: Delivery,
  open: (id: string, binding?: string) => void
) {
  return {
    name: "subagent_abort",
    label: "Abort subagent",
    exposure: "model-only",
    executionMode: "parallel",
    description:
      "Abort an active task only when its result is no longer needed. You do not receive its result. Resume its session later with the same task_id.",
    parameters: abortParameters,
    ...createRenderers(open, "subagent_abort", subagentAbortDisplayAdapter),
    async execute(_id: string, raw: AbortInput) {
      const parsed = abortInputSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid subagent_abort parameters");
      const { task_id } = parsed.data;
      tasks.owned(task_id);
      const direct = tasks.active(task_id);
      // Suppress cancellation only; a task that already finished must keep its real result.
      if (direct) delivery.suppress(direct);
      const record = await tasks.abort(task_id, ABORT_REASON);
      const details: ToolDetails = {
        ...(direct
          ? direct.details
          : {
              task_id,
              binding_id: tasks.bindingId,
              description: record.description,
              model: record.model,
              thinking: record.thinking,
              background: record.background,
              delivery: "follow_up" as const,
              started_at: record.started_at ?? Date.now(),
              ended_at: record.ended_at ?? null,
              activity: "",
              usage: record.usage ?? detailsUsage()
            }),
        state: record.outcome
      };
      details.ended_at ??= Date.now();

      return {
        content: [
          {
            type: "text" as const,
            text: formatTaskEnvelope({
              id: task_id,
              state: "cancelled",
              body: "The task is aborted. Resume its session with this task_id if needed."
            })
          }
        ],
        details
      };
    }
  } satisfies ToolDefinition<typeof abortParameters, ToolDetails, CardState>;
}
