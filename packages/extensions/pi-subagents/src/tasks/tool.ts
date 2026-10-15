import type {
  AgentToolUpdateCallback,
  ExtensionToolContext,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";

import { forwardDialog } from "../child/dialogs.ts";
import { PROGRESS_INTERVAL_MS } from "../constants.ts";
import { taskResult, type ToolDetails } from "../result.ts";
import { toolGuidance } from "./guidance.ts";
import { INTERRUPTED_WARNING, type Submission, type Tasks } from "./registry.ts";
import { createRenderers, type CardState } from "./render.ts";
import { toolInputSchema, toolParameters, type ToolInput } from "./tool-schema.ts";

// OpenCode task.ts at 907b3bc, with the dash escaped for the workspace's text convention.
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work \u2014 avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response."
].join("\n");

const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work \u2014 avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response."
].join("\n");

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
  const warning = result.interrupted ? INTERRUPTED_WARNING : undefined;

  return result.kind === "background"
    ? taskResult(
        result.details,
        BACKGROUND_STARTED,
        result.usage,
        "Background task started",
        warning
      )
    : taskResult(result.details, result.text, result.usage, undefined, warning);
}

export function createSubagentTool(
  tasks: Tasks,
  open: (id: string, binding?: string) => void,
  delegated: () => void,
  docs: string
) {
  return {
    name: "subagent",
    label: "Subagent",
    exposure: "model-only",
    executionMode: "parallel",
    description: toolGuidance(docs),
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

              // The first update after queueing means the call started a task run. A running call
              // also shows its elapsed time.
              if (next.state !== "queued" && !timer) {
                delegated();
                timer = setInterval(update, PROGRESS_INTERVAL_MS);
              }

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
