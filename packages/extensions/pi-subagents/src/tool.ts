import type {
  AgentToolUpdateCallback,
  ExtensionToolContext,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";

import { BACKGROUND_STARTED, BACKGROUND_UPDATED } from "./background.ts";
import { PROGRESS_INTERVAL_MS } from "./constants.ts";
import { forwardDialog } from "./dialogs.ts";
import { toolGuidance } from "./guidance.ts";
import { createRenderers, type CardState } from "./render.ts";
import { taskResult, type ToolDetails } from "./result.ts";
import { INTERRUPTED_WARNING, type Submission, type Tasks } from "./tasks.ts";
import { toolInputSchema, toolParameters, type ToolInput } from "./tool-schema.ts";

function toolResult(result: Submission) {
  if (result.kind === "input")
    return taskResult(
      result.details,
      result.details.background
        ? BACKGROUND_UPDATED
        : "Additional context sent to the running foreground task. Its original call will return the final result.",
      undefined,
      result.details.background ? "Background task updated" : "Foreground task updated"
    );
  const warning = result.interrupted ? `${INTERRUPTED_WARNING}\n\n` : "";

  return result.kind === "background"
    ? taskResult(
        result.details,
        `${warning}${BACKGROUND_STARTED}`,
        result.usage,
        "Background task started"
      )
    : taskResult(result.details, `${warning}${result.text}`, result.usage);
}

export function createSubagentTool(tasks: Tasks, open: (id: string, binding?: string) => void) {
  return {
    name: "subagent",
    label: "Subagent",
    exposure: "model-only",
    executionMode: "parallel",
    description: toolGuidance(),
    parameters: toolParameters,
    ...createRenderers(open),
    async execute(
      _id: string,
      raw: ToolInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<ToolDetails> | undefined,
      ctx: ExtensionToolContext
    ) {
      const parsed = toolInputSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid subagent parameters");
      let details: ToolDetails | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let callOpen = true;

      const update = () => {
        if (!callOpen || !details || !tasks.activeBinding) return;

        // A presentation callback must not throw out of a timer or leak the running process.
        try {
          onUpdate?.({ content: [], details: { ...details } });
        } catch {
          /* The final result still carries the latest details. */
        }
      };

      try {
        return toolResult(
          await tasks.submit(parsed.data, {
            ...(signal ? { signal } : {}),
            onChange: (next) => {
              details = next;
              // A running call also shows its elapsed time.
              if (next.state !== "queued") timer ??= setInterval(update, PROGRESS_INTERVAL_MS);
              update();
            },
            onUIRequest: (request, description, dialogSignal) =>
              forwardDialog(request, description, ctx.ui, dialogSignal)
          })
        );
      } finally {
        callOpen = false;
        clearInterval(timer);
      }
    }
  } satisfies ToolDefinition<typeof toolParameters, ToolDetails, CardState>;
}
