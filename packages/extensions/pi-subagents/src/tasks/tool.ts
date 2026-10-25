import type {
  AgentToolUpdateCallback,
  ExtensionToolContext,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { formatTaskEnvelope } from "@pi-mono/utils/task-envelope";

import { forwardDialog } from "../child/dialogs.ts";
import { taskResult, type ToolDetails } from "../result.ts";
import { INTERRUPTED_WARNING, type Submission, type Tasks } from "./registry.ts";
import { createRenderers, type CardState } from "./render.ts";
import {
  abortInputSchema,
  abortParameters,
  toolInputSchema,
  toolParameters,
  type AbortInput,
  type ToolInput
} from "./tool-schema.ts";

const PROGRESS_INTERVAL_MS = 1_000;

const ABORT_REASON = "Cancelled by supervisor";

/**
 * Configured `docs` follow the built-in guidance. A task is worth its lossy handoff only when it
 * needs little of the supervisor's context, so the guidance selects work by context, not by size.
 */
function toolGuidance(docs: string): string {
  return [
    "Launch an agent in a separate Pi process. You receive only its final message, so its intermediate steps stay out of your context.",
    "Delegate work that needs little of this conversation and can return a compact result, such as an independent investigation, a review, or a change to separate files. Do the work yourself when it depends on this conversation, when you need its details rather than a summary, or when it is a small lookup, such as a known file, symbol, or a narrow search.",
    "Split work by the context that each part needs, not by the type of work. Give coupled steps on the same files or data to one task.",
    "Launch independent tasks concurrently with multiple tool calls. Children share your working directory, so parallel tasks must not edit the same files.",
    "Each new task has a fresh conversation. Supply a detailed prompt, the expected final answer, whether to write code or research, explicit criteria for a review, and relevant verification commands.",
    "A result is the child's report, not verified fact. Check the facts that your next step depends on.",
    "Use task_id to continue a task with its previous context: ask it a follow-up question instead of starting again, or send an active task a finding that affects its work.",
    ...(docs ? [docs] : [])
  ].join("\n\n");
}

// Adapted from OpenCode's task.ts at 907b3bc, in plain case.
const BACKGROUND_STARTED = [
  "The task is working in the background. Its result arrives automatically when it finishes.",
  "Do not sleep, poll, or ask the task for status. Do not repeat its work or work on the files or topics that it uses.",
  "Work on something else, or briefly tell the user what you launched and end your response."
].join("\n");

const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. Its result arrives automatically when it finishes.",
  "Do not sleep, poll, or ask the task for status. Do not repeat its work or work on the files or topics that it uses.",
  "Work on something else, or briefly tell the user what you sent and end your response."
].join("\n");

function toolResult(result: Submission) {
  if (result.kind === "input")
    return taskResult({
      details: result.details,
      body: result.details.background
        ? BACKGROUND_UPDATED
        : "Additional context sent to the running foreground task. Its original call will return the final result.",
      summary: result.details.background ? "Background task updated" : "Foreground task updated"
    });
  const warning = result.interrupted ? INTERRUPTED_WARNING : undefined;

  return result.kind === "background"
    ? taskResult({
        details: result.details,
        body: BACKGROUND_STARTED,
        usage: result.usage,
        summary: "Background task started",
        notice: warning
      })
    : taskResult({
        details: result.details,
        body: result.text,
        usage: result.usage,
        notice: warning
      });
}

/** `current` resolves the tasks of the current session binding at each call. */
export function createSubagentTool(
  current: () => Promise<Tasks>,
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
      const tasks = await current();
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

export function createAbortTool(
  current: () => Promise<Tasks>,
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
    ...createRenderers(open, "subagent_abort"),
    async execute(_id: string, raw: AbortInput) {
      const parsed = abortInputSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid subagent_abort parameters");
      const { task_id } = parsed.data;
      const tasks = await current();
      // The model gave up this task's result; a task that already finished keeps its result.
      const { details } = await tasks.abort(task_id, { reason: ABORT_REASON, drop: true });

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
