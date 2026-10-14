import { isAbsolute } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderers
} from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { counterChannel, type Counter } from "pi-agent-summary/counters";
import { z } from "zod";

import { createAbortTool } from "./abort-tool.ts";
import { begin, currentRun, send } from "./begin.ts";
import { runCommand } from "./commands.ts";
import { remindTasks } from "./compaction.ts";
import { loadConfig } from "./config.ts";
import { OPEN_EVENT } from "./constants.ts";
import { Delivery } from "./delivery.ts";
import { getDepth, getTaskId } from "./depth.ts";
import { forwardDialog } from "./dialogs.ts";
import { getPiInvocation } from "./invocation.ts";
import { installLateUsagePatch } from "./late-usage.ts";
import { Panels } from "./panel.ts";
import { controlSchema, decode, slotReplySchema, type ChildMessage } from "./protocol.ts";
import { RunReader } from "./reader.ts";
import { createRenderers } from "./render.ts";
import { Tasks } from "./tasks.ts";
import { createSubagentTool } from "./tool.ts";
import { taskWidget } from "./widget.ts";

const delegated: Counter = {
  id: "pi-subagents.delegated",
  verb: "delegated",
  singular: "task",
  plural: "tasks"
};

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
  let reader: RunReader | undefined;
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
  // Pi rebuilds the chat on reload before session_start registers the tool.
  const cards: Record<string, ToolRenderers> = {
    subagent: createRenderers(emitOpen),
    subagent_abort: createRenderers(emitOpen, "subagent_abort")
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
      // Reserved subcommands from this child's supervisor. Pi reports them as handled even when
      // they throw; their replies travel through the protocol status.
      const reserved = /^(begin|slot|control) (.*)$/s.exec(args.trim());

      if (reserved && depth > 0 && taskId) {
        const [, name, payload = ""] = reserved;
        if (name === "begin") return begin(pi, payload, ctx);
        if (!tasks?.activeBinding) throw new Error("Subagent session has not started");

        if (name === "slot") {
          const reply = decode(slotReplySchema, payload);
          if (!reply) throw new Error("Invalid subagent slot reply");

          return tasks.slot(reply);
        }

        const control = decode(controlSchema, payload);
        if (!control) throw new Error("Invalid subagent control request");

        return tasks.control(control, (request, description, signal) =>
          forwardDialog(request, description, ctx.ui, signal)
        );
      }

      if (!args.trim() && ctx.mode === "tui") return panels?.open();

      const current = tasks;

      return runCommand(args, current && reader && { tasks: current, reader }, {
        notify: (message, type) => {
          if (current?.activeBinding && tasks === current) ctx.ui.notify(message, type);
        }
      });
    }
  });
  pi.registerShortcut("ctrl+alt+s", {
    description: "Open the subagents panel",
    handler: () => panels?.open()
  });

  const shutdown = (immediate: boolean) => {
    tasks?.invalidate();
    const stopped = tasks?.shutdown(immediate);
    reader?.dispose();
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
    const { docs, warnings, ...config } = loadConfig(ctx.cwd, {
      projectTrusted: ctx.isProjectTrusted()
    });
    for (const warning of warnings)
      ctx.ui.notify(displayText(`pi-subagents: ${warning}`), "warning");
    // An inline or built-in source names no file that a child could load.
    const extension = pi
      .getCommands()
      .find((command) => command.source === "extension" && command.name === "subagents")
      ?.sourceInfo.path;
    const current = new Tasks(config, ctx.sessionManager.getBranch(), {
      depth,
      sessionId: ctx.sessionManager.getSessionId(),
      invocation: getPiInvocation(),
      launch: () => ({
        model: ctx.model && `${ctx.model.provider}/${ctx.model.id}`,
        thinking: pi.getThinkingLevel(),
        cwd: ctx.cwd,
        trusted: ctx.isProjectTrusted(),
        parentSession: ctx.sessionManager.getSessionFile()
      }),
      ...(extension && isAbsolute(extension) ? { extension } : {}),
      warn: (message) => {
        if (tasks === current && current.activeBinding) ctx.ui.notify(message, "warning");
      },
      ...(depth > 0 && taskId
        ? { taskId, send: (message: ChildMessage) => send(ctx.ui, message) }
        : {}),
      append: (type, record) => {
        if (tasks === current && current.activeBinding) pi.appendEntry(type, record);
      }
    });
    tasks = current;
    reader = new RunReader(tasks);
    await tasks.readDescendants();
    delivery = new Delivery(tasks, pi, ctx, depth, waiting);
    panels = new Panels(tasks, reader, ctx);
    disposeWidget = taskWidget(tasks, ctx, () => open());
    if (depth >= config.maxDepth && !registered) return;
    const exposure = depth >= config.maxDepth ? "hidden" : "model-only";
    pi.registerTool({
      ...createSubagentTool(tasks, emitOpen, () => pi.events.emit(counterChannel, delegated), docs),
      exposure
    });
    pi.registerTool({ ...createAbortTool(tasks, emitOpen), exposure });
    registered = true;
  };

  pi.on("session_start", (_event, ctx) => bind(ctx));
  // A begun run is one chain under its marker; see ADR 0003.
  pi.on("session_before_tree", async (event, ctx) => {
    if (currentRun() !== undefined) return { cancel: true };
    const target = ctx.sessionManager.getEntry(event.preparation.targetId);
    // Pi moves to the parent of a user or custom message.
    const effective =
      (target?.type === "message" && target.message.role === "user") ||
      target?.type === "custom_message"
        ? target.parentId
        : event.preparation.targetId;
    if (effective !== ctx.sessionManager.getLeafId()) await shutdown(true);
  });
  pi.on("session_tree", async (_event, ctx) => {
    if (!tasks?.activeBinding) await bind(ctx);
  });
  pi.on("session_before_fork", async () => {
    if (currentRun() !== undefined) return { cancel: true };
    await shutdown(true);
  });
  pi.on("session_before_switch", async () => {
    if (currentRun() !== undefined) return { cancel: true };
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
