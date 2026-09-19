import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolExecutionStartEvent,
  ToolResultEvent
} from "@earendil-works/pi-coding-agent";
import { registerWorkingMessage, type WorkingMessageContext } from "@pi-mono/libs/working-message";
import { z } from "zod";

import { RunChanges } from "./changes.ts";
import { renderSummary } from "./render.ts";
import { summaryEntryType } from "./summary.ts";
import { AgentTimer } from "./timer.ts";

export type SummaryContext = WorkingMessageContext & Pick<ExtensionContext, "isIdle">;

export type SummaryEvents = {
  session_start: unknown;
  session_shutdown: unknown;
  agent_start: unknown;
  agent_settled: unknown;
  tool_execution_start: Pick<ToolExecutionStartEvent, "type" | "toolName" | "toolCallId" | "args">;
  tool_call: Pick<ToolCallEvent, "type" | "toolName" | "toolCallId" | "input">;
  tool_result: Pick<ToolResultEvent, "type" | "toolName" | "toolCallId">;
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

const fileInputSchema = z.object({ path: z.string().min(1) });

export default function piAgentSummary(pi: SummaryExtensionAPI): void {
  const workingMessage = registerWorkingMessage(pi, {
    id: "pi-agent-summary.elapsed",
    label: "Elapsed time",
    contributor: "pi-agent-summary"
  });
  const timer = new AgentTimer((text) => workingMessage.setText(text));
  let run: { changes: RunChanges; bashCalls: Set<string> } | undefined;

  const reset = () => {
    run = undefined;
    timer.reset();
  };

  pi.registerEntryRenderer(summaryEntryType, renderSummary);
  pi.on("session_start", reset);
  pi.on("agent_start", (_event, ctx) => {
    run ??= { changes: new RunChanges(ctx.cwd), bashCalls: new Set() };
    timer.start(ctx.mode === "tui");
  });
  pi.on("tool_execution_start", (event) => {
    if (event.toolName === "bash") run?.bashCalls.add(event.toolCallId);
  });
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const parsed = fileInputSchema.safeParse(event.input);
    if (parsed.success) await run?.changes.beforeCall(event.toolCallId, parsed.data.path);
  });
  pi.on("tool_result", async (event) => {
    await run?.changes.afterCall(event.toolCallId);
  });
  pi.on("agent_settled", (_event, ctx) => {
    // A preceding extension handler may already have started another run.
    if (!ctx.isIdle() || !run) return;
    const finished = run;
    run = undefined;
    const duration = timer.finish();
    if (duration)
      pi.appendEntry(summaryEntryType, {
        ...duration,
        bashCalls: finished.bashCalls.size,
        files: finished.changes.finish()
      });
  });
  pi.on("session_shutdown", reset);
}
