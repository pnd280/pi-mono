import type {
  ExtensionAPI,
  ExtensionContext,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  ToolExecutionStartEvent
} from "@earendil-works/pi-coding-agent";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { registerWorkingMessage, type WorkingMessageContext } from "@pi-mono/libs/working-message";

import { RunChanges } from "./changes.ts";
import { createSummaryRenderer } from "./render.ts";
import { summaryEntryType, type RunSummary } from "./summary.ts";
import { RunThroughput } from "./throughput.ts";
import { AgentTimer } from "./timer.ts";

export type SummaryContext = WorkingMessageContext &
  Pick<ExtensionContext, "isIdle" | "sessionManager">;

export type SummaryEvents = {
  session_start: unknown;
  session_shutdown: unknown;
  agent_start: unknown;
  agent_settled: unknown;
  message_start: MessageStartEvent;
  message_update: MessageUpdateEvent;
  message_end: MessageEndEvent;
  tool_execution_start: Pick<ToolExecutionStartEvent, "type" | "toolName" | "toolCallId" | "args">;
};

export type SummaryExtensionAPI = Pick<
  ExtensionAPI,
  "events" | "registerCommand" | "appendEntry" | "registerEntryRenderer"
> & {
  on<E extends keyof SummaryEvents>(
    event: E,
    handler: (event: SummaryEvents[E], ctx: SummaryContext) => void | Promise<void>
  ): void;
};

// Pi's `VIRTUAL_MODEL_API`, which the package index does not export.
const virtualModelApi = "pi-virtual";

export default function piAgentSummary(pi: SummaryExtensionAPI): void {
  const elapsed = registerWorkingMessage(pi, {
    id: "pi-agent-summary.elapsed",
    label: "Elapsed time",
    contributor: "pi-agent-summary"
  });
  const rate = registerWorkingMessage(pi, {
    id: "pi-agent-summary.throughput",
    label: "Output rate",
    contributor: "pi-agent-summary"
  });
  let run:
    | {
        changes: RunChanges;
        bashCalls: Set<string>;
        models: NonNullable<RunSummary["models"]>;
        throughput: RunThroughput;
      }
    | undefined;
  const timer = new AgentTimer((text) => {
    elapsed.setText(text);
    // The rate shares the timer's interval, so it refreshes and clears with the timer.
    rate.setText(text === undefined ? undefined : run?.throughput.text());
  });
  let manager: SummaryContext["sessionManager"] | undefined;
  let generation = 0;
  const connect = () =>
    observeFileMutations({
      eligible: (session) => session.sessionManager === manager,
      begin: () => {
        const changes = run?.changes;
        if (!changes) return;

        return {
          maxSourceBytes: changes.maxSourceBytes,
          completed: (mutation) => {
            if (run?.changes === changes) return changes.completed(mutation);
          }
        };
      }
    });
  let mutations: ReturnType<typeof connect> | undefined = connect();

  const bind = (ctx: SummaryContext) => {
    manager = ctx.sessionManager;
    mutations ??= connect();
    mutations.bind(manager);
  };

  const reset = () => {
    generation++;
    run = undefined;
    timer.reset();
  };

  pi.registerEntryRenderer(summaryEntryType, createSummaryRenderer());
  pi.on("session_start", (_event, ctx) => {
    reset();
    bind(ctx);
  });
  pi.on("agent_start", (_event, ctx) => {
    run ??= {
      changes: new RunChanges(ctx.cwd),
      bashCalls: new Set(),
      throughput: new RunThroughput(),
      models: []
    };
    if (manager !== ctx.sessionManager) bind(ctx);
    timer.start(ctx.mode === "tui");
  });
  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") run?.throughput.start();
  });
  pi.on("message_update", (event) => run?.throughput.update(event));
  pi.on("message_end", (event) => {
    const message = event.message;
    if (message.role !== "assistant" || !run) return;
    run.throughput.end(message.usage.output);
    // Assistant messages name the physical model a virtual selection routed to. Failed requests did
    // not answer, and routing that fails or is aborted leaves the virtual model on the message.
    if (message.stopReason === "error" || message.api === virtualModelApi) return;
    const { provider, model: id, thinkingLevel } = message;
    if (
      !run.models.some(
        (used) =>
          used.provider === provider && used.id === id && used.thinkingLevel === thinkingLevel
      )
    )
      run.models.push({ provider, id, ...(thinkingLevel && { thinkingLevel }) });
  });
  pi.on("tool_execution_start", (event) => {
    if (event.toolName === "bash") run?.bashCalls.add(event.toolCallId);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    // A preceding extension handler may already have started another run.
    if (!ctx.isIdle() || !run) return;
    const finishedAt = Date.now();
    const finished = run;
    run = undefined;
    const duration = timer.finish();
    if (!duration) return;
    const throughput = finished.throughput.finish();
    const startedGeneration = generation;
    const files = await finished.changes.finish();
    // A session switch or reload can occur while the net comparison runs off-thread.
    if (generation !== startedGeneration) return;
    pi.appendEntry(summaryEntryType, {
      ...duration,
      finishedAt,
      ...(finished.models.length > 0 && { models: finished.models }),
      ...(throughput && { throughput }),
      bashCalls: finished.bashCalls.size,
      files
    });
  });
  pi.on("session_shutdown", () => {
    reset();
    manager = undefined;
    mutations?.dispose();
    mutations = undefined;
  });
}
