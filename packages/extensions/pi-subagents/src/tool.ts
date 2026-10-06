import type {
  ExtensionAPI,
  ExtensionContext,
  AgentToolUpdateCallback,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";

import { BACKGROUND_STARTED, BACKGROUND_UPDATED } from "./background.ts";
import type { ChildOptions } from "./child.ts";
import { PROGRESS_INTERVAL_MS } from "./constants.ts";
import { forwardDialog } from "./dialogs.ts";
import { toolGuidance } from "./guidance.ts";
import type { PiInvocation } from "./invocation.ts";
import type { Reservation } from "./relay.ts";
import { createRenderers, type CardState } from "./render.ts";
import {
  boundedText,
  detailsUsage,
  taskResult,
  usageDifference,
  type ToolDetails
} from "./result.ts";
import type { ManagedTask, Tasks } from "./tasks.ts";
import { toolInputSchema, toolParameters, type ToolInput } from "./tool-schema.ts";

function selectedModel(
  override: string | undefined,
  current: { provider: string; id: string } | undefined
): string {
  if (override !== undefined) return override;
  if (!current) throw new Error("Select a model before launching a subagent");

  return `${current.provider}/${current.id}`;
}

async function taskReturn(task: ManagedTask, restored: Awaited<ReturnType<Tasks["resume"]>>) {
  const warning = restored?.warning;
  const started = await task.run.started;
  const result = started
    ? await Promise.race([task.done, task.background.then(() => undefined)])
    : await task.done;

  if (!result && started) {
    const stats = await task.run.stats();
    // Without stats the call reports no usage, so all run usage arrives with the result.
    task.reported = stats ?? started.usageStart;
    const usage = stats ? usageDifference(started.usageStart, stats) : undefined;

    return taskResult(
      {
        ...task.details,
        state: "running",
        // The call has returned; a fixed end keeps its card from claiming live progress.
        ended_at: Date.now(),
        returned: "background",
        background: true,
        usage: detailsUsage(usage)
      },
      warning ? `${warning}\n\n${BACKGROUND_STARTED}` : BACKGROUND_STARTED,
      usage,
      "Background task started"
    );
  }

  const final = result ?? (await task.done);
  const usage =
    final.usageStart && final.usageEnd
      ? usageDifference(final.usageStart, final.usageEnd)
      : undefined;

  return taskResult(
    { ...task.details, usage: detailsUsage(usage) },
    warning ? `${warning}\n\n${final.text}` : final.text,
    usage
  );
}

function childOptions(
  input: ToolInput,
  ctx: ExtensionContext,
  invocation: PiInvocation,
  depth: number,
  model: string,
  thinking: string,
  restored: Awaited<ReturnType<Tasks["resume"]>>
): ChildOptions {
  const parentSession = ctx.sessionManager.getSessionFile();

  return {
    invocation,
    cwd: ctx.cwd,
    depth: depth + 1,
    model,
    thinking,
    trusted: ctx.isProjectTrusted(),
    ...(restored ? { sessionFile: restored.sessionFile, restored } : {}),
    ...(input.task_id === undefined ? {} : { taskId: input.task_id }),
    ...(parentSession === undefined ? {} : { parentSession }),
    prompt: input.prompt,
    streamingBehavior: input.delivery === "steer" ? "steer" : "followUp"
  };
}

function queuedDetails(input: ToolInput, model: string, thinking: string): ToolDetails {
  return {
    ...(input.task_id === undefined ? {} : { task_id: input.task_id }),
    description: boundedText(input.description),
    model: boundedText(model),
    thinking: boundedText(thinking),
    background: input.background ?? false,
    delivery: input.delivery ?? "follow_up",
    state: "queued",
    started_at: Date.now(),
    ended_at: null,
    activity: "",
    usage: detailsUsage()
  };
}

export function createSubagentTool(
  tasks: Tasks,
  invocation: PiInvocation,
  getThinkingLevel: ExtensionAPI["getThinkingLevel"],
  depth: number,
  open: (id: string, binding?: string) => void
) {
  const updateActive = async (input: ToolInput) => {
    if (!input.task_id) return;
    const updated = await tasks.update(input.task_id, input.prompt, input.delivery ?? "follow_up");
    // An update call's details describe that call, which returns at once.
    const now = Date.now();

    return updated
      ? taskResult(
          { ...updated, started_at: now, ended_at: now, returned: "input" },
          updated.background
            ? BACKGROUND_UPDATED
            : "Additional context sent to the running foreground task. Its original call will return the final result.",
          undefined,
          updated.background ? "Background task updated" : "Foreground task updated"
        )
      : undefined;
  };

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
      ctx: ExtensionContext
    ) {
      const parsed = toolInputSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid subagent parameters");
      const input = parsed.data;
      if (signal?.aborted) throw new Error("Cancelled by turn abort");

      const updated = await updateActive(input);
      if (updated) return updated;

      const model = selectedModel(input.model, ctx.model);
      const thinking = input.thinking ?? getThinkingLevel();
      const unclaim = tasks.claim(input.task_id);
      let reservation: Reservation | undefined;
      let task: ManagedTask | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      const dialogs = new AbortController();
      let callOpen = true;
      let details = queuedDetails(input, model, thinking);

      const update = () => {
        if (!callOpen || !tasks.activeBinding) return;

        // A presentation callback must not throw out of a timer or leak the running process.
        try {
          onUpdate?.({ content: [], details: { ...details } });
        } catch {
          /* The final result still carries the latest details. */
        }
      };

      const abort = () => {
        if (task && !task.details.background) void task.run.terminate("Cancelled by turn abort");
      };

      try {
        update();
        reservation = await tasks.relay.acquire(signal);
        if (signal?.aborted) throw new Error("Cancelled by turn abort");
        await tasks.adopt(input.task_id);
        const restored = await tasks.resume(input.task_id);
        signal?.throwIfAborted();

        details = { ...details, state: "running", started_at: Date.now() };
        task = tasks.start(
          input.description,
          {
            ...childOptions(input, ctx, invocation, depth, model, thinking, restored),
            onStart: () => update(),
            onActivity: () => update(),
            onUIRequest: (request) => {
              if (!tasks.activeBinding) return;
              void forwardDialog(request, input.description, ctx.ui, dialogs.signal)
                .then((response) => {
                  if (tasks.activeBinding && response)
                    return task?.run.connection.respond(response);
                })
                .catch(() => {
                  if (!tasks.activeBinding) return;
                  // If a supervisor dialog failed, dismiss the child's matching request.
                  void task?.run.connection
                    .respond({ type: "extension_ui_response", id: request.id, cancelled: true })
                    .catch(() => {});
                });
            }
          },
          reservation,
          input.background ?? false
        );
        details = task.details;
        void task.done.finally(() => dialogs.abort());
        signal?.addEventListener("abort", abort, { once: true });
        timer = setInterval(update, PROGRESS_INTERVAL_MS);

        return await taskReturn(task, restored);
      } catch (error) {
        if (task && !task.details.background)
          await task.run.cancel("Cancelled after subagent call failure");
        details = {
          ...details,
          state: signal?.aborted ? "cancelled" : "failed",
          ended_at: Date.now()
        };

        return taskResult(details, error instanceof Error ? error.message : "Subagent call failed");
      } finally {
        callOpen = false;
        clearInterval(timer);
        signal?.removeEventListener("abort", abort);

        if (!task) {
          dialogs.abort();
          reservation?.release();
        }

        unclaim();
      }
    }
  } satisfies ToolDefinition<typeof toolParameters, ToolDetails, CardState>;
}
