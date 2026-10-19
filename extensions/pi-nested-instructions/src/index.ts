import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { discover, refresh } from "./discovery.ts";
import type { Invocation } from "./scopes.ts";

export default function nestedInstructions(pi: ExtensionAPI) {
  let nestedCalls: Invocation[] = [];
  pi.on("turn_start", () => {
    nestedCalls = [];
  });
  pi.on("tool_execution_start", (event) => {
    if (!event.parentToolCallId) return;
    const tool = pi.getAllTools().find((candidate) => candidate.name === event.toolName);
    nestedCalls.push({
      toolCallId: event.toolCallId,
      parentToolCallId: event.parentToolCallId,
      toolName: event.toolName,
      input: event.args,
      ...(tool ? { sourceInfo: tool.sourceInfo } : {})
    });
  });
  pi.on("turn_end", async (event, ctx) => {
    const calls = nestedCalls;
    nestedCalls = [];
    if (event.message.role !== "assistant") return;

    try {
      const tools = pi.getAllTools();

      // Issued inputs count even if validation or a guard blocked execution.
      // Never inspect event.toolResults, including their success status.
      for (const call of event.message.content) {
        if (call.type !== "toolCall") continue;
        const tool = tools.find((candidate) => candidate.name === call.name);

        calls.push({
          toolCallId: call.id,
          callEntryId: event.messageEntryId,
          toolName: call.name,
          input: call.arguments,
          ...(tool ? { sourceInfo: tool.sourceInfo } : {})
        });
      }

      // Earlier boundary handlers can add notices or edit context before drafts are committed.
      const branch = ctx.sessionManager.getBranch();
      const projected = event.context.contextEntries;
      const entries = new Map(
        [...branch, ...projected.map((entry) => entry.sourceEntry)].map((entry) => [
          entry.id,
          entry
        ])
      );
      const discovered = await discover(calls, ctx.cwd, {
        buildSessionProjection: () => ({ entries: projected }),
        getBranch: () => [...entries.values()]
      });

      return { entries: [...event.entries, ...discovered] };
    } catch {
      return undefined;
    }
  });
  pi.on("session_shutdown", () => {
    nestedCalls = [];
  });
  pi.on("session_start", async (_event, ctx) => {
    nestedCalls = [];

    try {
      for (const message of await refresh(ctx.cwd, ctx.sessionManager)) {
        pi.sendMessage(message, { triggerTurn: false });
      }
    } catch {
      /* Discovery never prevents starting or reloading a session. */
    }
  });
}
