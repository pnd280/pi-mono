import { isAbsolute } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";
import { counterChannel, type Counter } from "pi-agent-summary/counters";
import { z } from "zod";

import { navigationLeaf, SessionBinding, type BindingSession } from "./binding.ts";
import { getDepth, getTaskId } from "./child/depth.ts";
import { forwardDialog } from "./child/dialogs.ts";
import { getPiInvocation, type PiInvocation } from "./child/invocation.ts";
import type * as CommandsModule from "./commands.ts";
import { remindTasks } from "./compaction.ts";
import { loadConfig } from "./config.ts";
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
import { createJobAbortTool, createJobTool } from "./jobs/tool.ts";
import { installLateUsagePatch } from "./late-usage.ts";
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

/**
 * The Pi adapter: it maps Pi's events, tools, and commands to the session binding. Pi gives no
 * options; an in-process host sets `invocation` when its own entry does not start Pi.
 */
export default function subagents(
  pi: ExtensionAPI,
  options: { invocation?: PiInvocation } = {}
): void {
  const depth = getDepth();
  const taskId = getTaskId();
  let lateUsageWarning = installLateUsagePatch();
  const lifecycle = joinLifecycle(pi, { id: "pi-subagents" });
  const waiting = registerWorkingMessage(pi, {
    id: "pi-subagents.waiting",
    label: "Background wait",
    contributor: "pi-subagents",
    ownerRank: 300
  });
  const binding = new SessionBinding();

  const action = z.union([
    z.object({ task_id: z.string().min(1), binding_id: z.string().min(1) }),
    z.object({ job_id: z.string().min(1), binding_id: z.string().min(1) })
  ]);
  // Subscribed at load, so a click during startup waits for the binding instead of being lost.
  const unsubscribe = pi.events.on(OPEN_EVENT, (value) => {
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
  const emitOpen = (task_id: string, binding_id?: string) =>
    pi.events.emit(OPEN_EVENT, { task_id, binding_id });
  const emitOpenJob = (job_id: string, binding_id?: string) =>
    pi.events.emit(OPEN_EVENT, { job_id, binding_id });

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
          // Stopped bindings write nothing, so a command that outlives its session shows no output.
          if (binding.isCurrent(bound)) ctx.ui.notify(message, type);
        }
      });
    }
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
        invocation: options.invocation ?? getPiInvocation(),
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

  let registered: string | undefined;

  /**
   * Registers the four tools when their exposure, docs, or delivery changed since the last
   * registration. Pi cannot remove a tool, so turned-off tools are hidden. Without `--tools`, Pi
   * activates a `model-only` tool when it is first registered or when its exposure changes to
   * `model-only`. With `--tools`, every registration activates each listed tool again, which would
   * undo the active tools that a profile chose; an unchanged registration is therefore skipped.
   */
  const registerTools = (tasks: boolean, jobs: boolean, docs: string, delivers: boolean) => {
    const key = JSON.stringify([tasks, jobs, docs, delivers]);
    if (key === registered) return;
    registered = key;
    const taskExposure = tasks ? "model-only" : "hidden";
    const jobExposure = jobs ? "model-only" : "hidden";
    pi.registerTool({
      ...createSubagentTool(
        currentTasks,
        emitOpen,
        () => pi.events.emit(counterChannel, delegated),
        docs
      ),
      exposure: taskExposure
    });
    pi.registerTool({ ...createAbortTool(currentTasks, emitOpen), exposure: taskExposure });
    pi.registerTool({
      ...createJobTool(currentJobs, emitOpenJob, delivers),
      exposure: jobExposure
    });
    pi.registerTool({ ...createJobAbortTool(currentJobs, emitOpenJob), exposure: jobExposure });
  };

  // Registered at load, so Pi activates them before any session_start handler, such as a profile,
  // chooses the active tools.
  registerTools(true, true, "", depth === 0);

  /** Opens the binding on the session and selected ancestry in `ctx`, then offers its tools. */
  const open = async (ctx: ExtensionContext, { docs, ...opened } = session(ctx)) => {
    await binding.open(opened);
    const { maxDepth, jobs } = opened.config;
    // Jobs apply at all depths. They run commands through Pi's built-in shell.
    const foreign =
      jobs &&
      pi.getAllTools().some((tool) => tool.name === "bash" && tool.sourceInfo.source !== "builtin");
    if (foreign) ctx.ui.notify(FOREIGN_BASH_WARNING, "warning");
    jobsOn = jobs && !foreign;
    // Print, JSON, and child runs end with their final reply, and their jobs end with them.
    const delivers = depth === 0 && ctx.mode !== "print" && ctx.mode !== "json";
    registerTools(depth < maxDepth, jobsOn, docs, delivers);
  };

  lifecycle.onSessionStart(async (_event, ctx, arrival) => {
    const started = session(ctx);
    // A claim that overlaps another participant's claim is not registered, with a warning.
    arrival.claimShortcut(started.config.shortcut, {
      description: "Open the subagents panel",
      handler: async () => (await binding.current())?.panels.open()
    });
    await open(ctx, started);
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
  // The handler awaits the binding, so its run mark keeps later participants' run timing exact.
  lifecycle.onAgentStart(() => binding.runStarted());
  pi.on("turn_end", (event) => binding.delivery?.turn(event));
  pi.on("agent_end", (event, ctx) => binding.delivery?.end(event, ctx));
  pi.on("agent_settled", (_event, ctx) => binding.delivery?.settled(ctx));
  pi.on("agent_before_settle", () => binding.delivery?.settle());
  pi.on("session_compact", async () => {
    const bound = await binding.current();
    if (bound) remindTasks(pi, bound.tasks, jobsOn ? bound.jobs : undefined);
  });
  // The revoke runs before any participant's shutdown handler awaits, so no task or job starts,
  // writes an entry, or delivers a result after shutdown begins. Cleanup then stops them.
  lifecycle.onSessionShutdown(
    () => {
      unsubscribe();
      binding.revoke();
    },
    (event) =>
      binding.close(event.reason === "new" || event.reason === "resume" || event.reason === "fork")
  );
}
