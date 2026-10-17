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

import { navigationLeaf, SessionBinding, type BindingSession } from "./binding.ts";
import { getDepth, getTaskId } from "./child/depth.ts";
import { forwardDialog } from "./child/dialogs.ts";
import { getPiInvocation } from "./child/invocation.ts";
import type * as CommandsModule from "./commands.ts";
import { remindTasks } from "./compaction.ts";
import { loadConfig, type SubagentsConfig } from "./config.ts";
import { OPEN_EVENT } from "./constants.ts";
import { begin, currentRun, send } from "./coordination/begin.ts";
import {
  controlSchema,
  decode,
  slotReplySchema,
  type ChildMessage
} from "./coordination/protocol.ts";
import { Delivery } from "./delivery.ts";
import { shellOptions } from "./jobs/registry.ts";
import { createJobAbortTool, createJobRenderers, createJobTool } from "./jobs/tool.ts";
import { installLateUsagePatch } from "./late-usage.ts";
import { createRenderers } from "./tasks/render.ts";
import { createAbortTool, createSubagentTool } from "./tasks/tool.ts";

// Commands load at first use. Concurrent calls share one import.
let commands: Promise<typeof CommandsModule> | undefined;
const loadCommands = () => (commands ??= import("./commands.ts"));

const delegated: Counter = {
  id: "pi-subagents.delegated",
  verb: "delegated",
  singular: "task",
  plural: "tasks"
};

const startedJobs: Counter = {
  id: "pi-subagents.jobs",
  verb: "started",
  singular: "job",
  plural: "jobs"
};

/** A job runs commands through Pi's built-in shell, outside another extension's `bash`. */
const FOREIGN_BASH_WARNING =
  "pi-subagents: job and job_abort are off because another extension owns bash";

/** The Pi adapter: it maps Pi's events, tools, and commands to the session binding. */
export default function subagents(pi: ExtensionAPI): void {
  const depth = getDepth();
  const taskId = getTaskId();
  let lateUsageWarning = installLateUsagePatch();
  const waiting = registerWorkingMessage(pi, {
    id: "pi-subagents.waiting",
    label: "Background wait",
    contributor: "pi-subagents"
  });
  const binding = new SessionBinding();

  const action = z.union([
    z.object({ task_id: z.string().min(1), binding_id: z.string().min(1) }),
    z.object({ job_id: z.string().min(1), binding_id: z.string().min(1) })
  ]);
  const subscribe = () =>
    pi.events.on(OPEN_EVENT, (value) => {
      const parsed = action.safeParse(value).data;
      if (!parsed) return;
      void binding
        .current()
        .then((bound) => {
          if (!bound) return;
          if ("job_id" in parsed) {
            if (parsed.binding_id === bound.jobs.bindingId)
              return bound.panels.openJob(parsed.job_id);
          } else if (parsed.binding_id === bound.tasks.bindingId)
            return bound.panels.open(parsed.task_id);
        })
        .catch(() => {
          /* Foreign or stale task and job actions are ignored. */
        });
    });
  let unsubscribe: (() => void) | undefined;
  const emitOpen = (task_id: string, binding_id?: string) =>
    pi.events.emit(OPEN_EVENT, { task_id, binding_id });
  const emitOpenJob = (job_id: string, binding_id?: string) =>
    pi.events.emit(OPEN_EVENT, { job_id, binding_id });
  // Pi rebuilds the chat on reload before session_start registers the tool.
  const cards: Record<string, ToolRenderers> = {
    subagent: createRenderers(emitOpen),
    subagent_abort: createRenderers(emitOpen, "subagent_abort"),
    job: createJobRenderers(emitOpenJob),
    job_abort: createJobRenderers(emitOpenJob, "job_abort")
  };
  pi.registerToolRenderer((name, next) => {
    const own = Object.hasOwn(cards, name) ? cards[name] : undefined;

    return own ? (next() ?? own) : next();
  });

  const currentTasks = async () => {
    const bound = await binding.current();
    if (!bound) throw new Error("Subagent session ended");

    return bound.tasks;
  };

  const currentJobs = async () => {
    const bound = await binding.current();
    if (!bound) throw new Error("Job session ended");

    return bound.jobs;
  };

  let registered = false;
  let jobsRegistered = false;
  /** The current binding offers the job tools. */
  let jobsOn = false;
  pi.registerCommand("subagents", {
    description:
      "List tasks or jobs, show <task_id> (--since, --limit, --last) or <job_id>, abort <task_id|job_id>, or background [task_id]",
    handler: async (args, ctx) => {
      // Reserved subcommands from this child's supervisor. Pi reports them as handled even when
      // they throw; their replies travel through the protocol status.
      const reserved = /^(begin|slot|control) (.*)$/s.exec(args.trim());

      if (reserved && depth > 0 && taskId) {
        const [, name, payload = ""] = reserved;
        if (name === "begin") return begin(pi, payload, ctx);
        const tasks = (await binding.current())?.tasks;
        if (!tasks) throw new Error("Subagent session has not started");

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

      const bound = await binding.current();
      if (!args.trim() && ctx.mode === "tui") return bound?.panels.open();
      const { runCommand } = await loadCommands();

      return runCommand(args, bound, {
        notify: (message, type) => {
          if (binding.isCurrent(bound)) ctx.ui.notify(message, type);
        }
      });
    }
  });
  pi.registerShortcut("ctrl+alt+s", {
    description: "Open the subagents panel",
    handler: async () => (await binding.current())?.panels.open()
  });

  /** The binding's view of the session in `ctx`, after the warnings of its settings. */
  const session = (ctx: ExtensionContext): BindingSession & { docs: string } => {
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
    const sessionId = ctx.sessionManager.getSessionId();

    return {
      docs,
      config,
      branch: () => ctx.sessionManager.getBranch(),
      tasks: {
        depth,
        sessionId,
        invocation: getPiInvocation(),
        launch: () => ({
          model: ctx.model && `${ctx.model.provider}/${ctx.model.id}`,
          thinking: pi.getThinkingLevel(),
          cwd: ctx.cwd,
          trusted: ctx.isProjectTrusted(),
          parentSession: ctx.sessionManager.getSessionFile()
        }),
        ...(extension && isAbsolute(extension) ? { extension } : {}),
        ...(depth > 0 && taskId
          ? { taskId, send: (message: ChildMessage) => send(ctx.ui, message) }
          : {})
      },
      jobs: {
        ...shellOptions(pi.getSettings()),
        sessionId,
        cwd: ctx.cwd,
        started: () => pi.events.emit(counterChannel, startedJobs)
      },
      append: (type, data) => pi.appendEntry(type, data),
      warn: (message) => ctx.ui.notify(message, "warning"),
      delivery: new Delivery(pi, ctx, depth, waiting, config.resultDelivery),
      ui: ctx
    };
  };

  /** Opens the binding on the session and selected ancestry in `ctx`, then offers its tools. */
  const open = async (ctx: ExtensionContext) => {
    const { docs, ...opened } = session(ctx);
    await binding.open(opened);
    jobsOn = registerJobs(opened.config.jobs, ctx);
    registerTasks(opened.config, docs);
  };

  /** Pi cannot remove a tool, so a binding beyond the depth limit hides the registered tools. */
  const registerTasks = (config: SubagentsConfig, docs: string) => {
    if (depth >= config.maxDepth && !registered) return;
    const exposure = depth >= config.maxDepth ? "hidden" : "model-only";
    pi.registerTool({
      ...createSubagentTool(
        currentTasks,
        emitOpen,
        () => pi.events.emit(counterChannel, delegated),
        docs
      ),
      exposure
    });
    pi.registerTool({ ...createAbortTool(currentTasks, emitOpen), exposure });
    registered = true;
  };

  /** Jobs apply at all depths; Pi cannot remove a tool, so turned-off tools become hidden. */
  const registerJobs = (enabled: boolean, ctx: ExtensionContext): boolean => {
    const foreign =
      enabled &&
      pi.getAllTools().some((tool) => tool.name === "bash" && tool.sourceInfo.source !== "builtin");
    if (foreign) ctx.ui.notify(FOREIGN_BASH_WARNING, "warning");
    const on = enabled && !foreign;
    if (!on && !jobsRegistered) return on;
    const exposure = on ? "model-only" : "hidden";
    // Print, JSON, and child runs end with their final reply, and their jobs end with them.
    const delivers = depth === 0 && ctx.mode !== "print" && ctx.mode !== "json";
    pi.registerTool({ ...createJobTool(currentJobs, emitOpenJob, delivers), exposure });
    pi.registerTool({ ...createJobAbortTool(currentJobs, emitOpenJob), exposure });
    jobsRegistered = true;

    return on;
  };

  pi.on("session_start", (_event, ctx) => {
    unsubscribe ??= subscribe();

    return open(ctx);
  });
  // A begun run is one chain under its marker; see ADR 0003.
  pi.on("session_before_tree", async (event, ctx) => {
    if (currentRun() !== undefined) return { cancel: true };
    const { targetId } = event.preparation;
    if (
      navigationLeaf(ctx.sessionManager.getEntry(targetId), targetId) !==
      ctx.sessionManager.getLeafId()
    )
      await binding.beforeChange();
  });
  pi.on("session_tree", async (event, ctx) => {
    // The navigation is final: jobs of the previous leaf stop before the new ancestry binds.
    if (event.oldLeafId !== event.newLeafId) await open(ctx);
    // The binding stays; tasks that a cancelled change stopped reopen.
    else await binding.current();
  });
  pi.on("session_before_fork", async () => {
    if (currentRun() !== undefined) return { cancel: true };
    await binding.beforeChange();
  });
  pi.on("session_before_switch", async () => {
    if (currentRun() !== undefined) return { cancel: true };
    await binding.beforeChange();
  });
  pi.on("agent_start", () => binding.runStarted());
  pi.on("turn_end", (event) => binding.delivery?.turn(event));
  pi.on("agent_end", (event, ctx) => binding.delivery?.end(event, ctx));
  pi.on("agent_settled", (_event, ctx) => binding.delivery?.settled(ctx));
  pi.on("agent_before_settle", () => binding.delivery?.settle());
  pi.on("session_compact", async () => {
    const bound = await binding.current();
    if (bound) remindTasks(pi, bound.tasks, jobsOn ? bound.jobs : undefined);
  });
  pi.on("session_shutdown", async (event) => {
    unsubscribe?.();
    unsubscribe = undefined;
    await binding.close(
      event.reason === "new" || event.reason === "resume" || event.reason === "fork"
    );
  });
}
