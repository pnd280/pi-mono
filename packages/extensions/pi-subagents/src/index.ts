import { contentText } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderers
} from "@earendil-works/pi-coding-agent";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { subagentAbortDisplayAdapter } from "pi-tool-display/adapters";
import { z } from "zod";

import { createAbortTool } from "./abort-tool.ts";
import { runCommand } from "./commands.ts";
import { remindTasks } from "./compaction.ts";
import { loadConfig } from "./config.ts";
import { OPEN_EVENT, RESULT_MESSAGE } from "./constants.ts";
import { Delivery } from "./delivery.ts";
import { getDepth, getTaskId } from "./depth.ts";
import { getPiInvocation } from "./invocation.ts";
import { installLateUsagePatch } from "./late-usage.ts";
import { Panels } from "./panel.ts";
import { createRenderers, resultRenderer } from "./render.ts";
import { Tasks } from "./tasks.ts";
import { createSubagentTool } from "./tool.ts";
import { taskWidget } from "./widget.ts";

export default function subagents(pi: ExtensionAPI): void {
  const depth = getDepth();
  const taskId = getTaskId();
  let lateUsageWarning = installLateUsagePatch();
  const waiting = registerWorkingMessage(pi, {
    id: "pi-subagents.waiting",
    label: "Background wait",
    contributor: "pi-subagents"
  });
  let tasks: Tasks | undefined;
  let delivery: Delivery | undefined;
  let panels: Panels | undefined;
  let disposeWidget: (() => void) | undefined;

  const open = (taskId?: string) => {
    try {
      void panels?.open(taskId).catch(() => {});
    } catch {
      /* Foreign or stale task actions are ignored. */
    }
  };

  const action = z.object({ task_id: z.string().min(1), binding_id: z.string().min(1) });
  let unsubscribe: (() => void) | undefined;
  const subscribe = () =>
    pi.events.on(OPEN_EVENT, (value) => {
      const parsed = action.safeParse(value);
      if (parsed.success && tasks?.activeBinding && parsed.data.binding_id === tasks.bindingId)
        open(parsed.data.task_id);
    });
  const emitOpen = (task_id: string, binding_id?: string) =>
    pi.events.emit(OPEN_EVENT, { task_id, binding_id });
  pi.registerMessageRenderer(RESULT_MESSAGE, resultRenderer(emitOpen));
  // Pi rebuilds the chat on reload before session_start registers the tool.
  const cards: Record<string, ToolRenderers> = {
    subagent: createRenderers(emitOpen),
    subagent_abort: createRenderers(emitOpen, "subagent_abort", subagentAbortDisplayAdapter)
  };
  pi.registerToolRenderer((name, next) => {
    const own = Object.hasOwn(cards, name) ? cards[name] : undefined;

    return own ? (next() ?? own) : next();
  });
  let registered = false;
  pi.registerCommand("subagents", {
    description:
      "List tasks, show <task_id> (--since, --limit, --last), abort <task_id>, or background [task_id]",
    handler: async (args, ctx) => {
      if (!args.trim() && ctx.mode === "tui") return panels?.open();

      const current = tasks;

      return runCommand(
        args,
        current,
        {
          notify: (message, type) => {
            if (current?.activeBinding && tasks === current) ctx.ui.notify(message, type);
          }
        },
        depth
      );
    }
  });
  pi.registerShortcut("ctrl+alt+s", {
    description: "Open the subagents panel",
    handler: () => panels?.open()
  });

  const shutdown = (immediate: boolean) => {
    tasks?.invalidate();
    const stopped = tasks?.shutdown(immediate);
    delivery?.shutdown();
    panels?.dispose();
    disposeWidget?.();
    unsubscribe?.();

    return stopped;
  };

  const bind = async (ctx: ExtensionContext) => {
    await shutdown(true);
    unsubscribe = subscribe();
    if (lateUsageWarning) ctx.ui.notify(lateUsageWarning, "warning");
    lateUsageWarning = undefined;
    const config = loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    const current = new Tasks(config, ctx.sessionManager.getBranch(), {
      depth,
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile(),
      warn: (message) => {
        if (tasks === current && current.activeBinding) ctx.ui.notify(message, "warning");
      },
      ...(depth > 0 && taskId ? { taskId } : {}),
      append: (type, record) => {
        if (tasks === current && current.activeBinding) pi.appendEntry(type, record);
      },
      input: async (task_id, prompt, delivery) => {
        const record = current.owned(task_id);
        const result = await tool.execute(
          "relay",
          { task_id, prompt, delivery, description: record.description, background: true },
          undefined,
          undefined,
          ctx
        );
        if (result.isError) throw new Error(contentText(result.content));

        return result.details;
      }
    });
    tasks = current;
    await tasks.recover();
    delivery = new Delivery(tasks, pi, ctx, depth, waiting);
    panels = new Panels(tasks, ctx);
    disposeWidget = taskWidget(tasks, ctx, () => open());
    const tool = createSubagentTool(
      tasks,
      getPiInvocation(),
      () => pi.getThinkingLevel(),
      depth,
      emitOpen
    );
    if (depth >= config.maxDepth && !registered) return;
    const exposure = depth >= config.maxDepth ? "hidden" : "model-only";
    pi.registerTool({ ...tool, exposure });
    pi.registerTool({ ...createAbortTool(tasks, delivery, emitOpen), exposure });
    registered = true;
  };

  pi.on("session_start", (_event, ctx) => bind(ctx));
  pi.on("session_before_tree", async (event, ctx) => {
    const target = ctx.sessionManager.getEntry(event.preparation.targetId);
    const effective =
      target?.type === "message" && target.message.role === "user"
        ? target.parentId
        : event.preparation.targetId;
    if (effective !== ctx.sessionManager.getLeafId()) await shutdown(true);
  });
  pi.on("session_tree", async (_event, ctx) => {
    if (!tasks?.activeBinding) await bind(ctx);
  });
  pi.on("session_before_fork", async () => {
    await shutdown(true);
  });
  pi.on("session_before_switch", async () => {
    await shutdown(true);
  });
  pi.on("agent_end", (event, ctx) => delivery?.end(event, ctx));
  pi.on("agent_settled", (_event, ctx) => delivery?.settled(ctx));
  pi.on("agent_before_settle", () => delivery?.settle());
  pi.on("session_compact", () => {
    if (tasks?.activeBinding) remindTasks(pi, tasks, depth);
  });
  pi.on("session_shutdown", async (event) => {
    await shutdown(event.reason === "new" || event.reason === "resume" || event.reason === "fork");
  });
}
