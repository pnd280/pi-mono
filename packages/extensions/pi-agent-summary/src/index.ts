import type {
  ExtensionAPI,
  ExtensionContext,
  ToolExecutionStartEvent
} from "@earendil-works/pi-coding-agent";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { registerWorkingMessage, type WorkingMessageContext } from "@pi-mono/libs/working-message";

import { RunChanges } from "./changes.ts";
import { createSummaryRenderer } from "./render.ts";
import { summaryEntryType } from "./summary.ts";
import { AgentTimer } from "./timer.ts";

export type SummaryContext = WorkingMessageContext &
  Pick<ExtensionContext, "isIdle" | "sessionManager">;

export type SummaryEvents = {
  session_start: unknown;
  session_shutdown: unknown;
  agent_start: unknown;
  agent_settled: unknown;
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

export default function piAgentSummary(pi: SummaryExtensionAPI): void {
  const workingMessage = registerWorkingMessage(pi, {
    id: "pi-agent-summary.elapsed",
    label: "Elapsed time",
    contributor: "pi-agent-summary"
  });
  const timer = new AgentTimer((text) => workingMessage.setText(text));
  let run: { changes: RunChanges; bashCalls: Set<string> } | undefined;
  let manager: SummaryContext["sessionManager"] | undefined;
  let generation = 0;
  const connect = () =>
    observeFileMutations({
      eligible: (session) => session.sessionManager === manager,
      begin: () => {
        const changes = run?.changes;
        if (!changes) return;
        const sink = changes.sink();

        return {
          ...sink,
          completed: (mutation) => {
            if (run?.changes === changes) return sink.completed(mutation);
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
    run ??= { changes: new RunChanges(ctx.cwd), bashCalls: new Set() };
    if (manager !== ctx.sessionManager) bind(ctx);
    timer.start(ctx.mode === "tui");
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
    const startedGeneration = generation;
    const files = await finished.changes.finish();
    // A session switch or reload can occur while the net comparison runs off-thread.
    if (generation !== startedGeneration) return;
    pi.appendEntry(summaryEntryType, {
      ...duration,
      finishedAt,
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
