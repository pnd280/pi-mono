import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { discover, refresh } from "./discovery.ts";
import type { Invocation } from "./scopes.ts";

export default function nestedInstructions(pi: ExtensionAPI) {
  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    try {
      const tools = pi.getAllTools();
      const calls: Invocation[] = [];

      // Issued inputs count even if validation or a guard blocked execution.
      // Never inspect event.toolResults, including their success status.
      for (const call of event.message.content) {
        if (call.type !== "toolCall") continue;
        const tool = tools.find((candidate) => candidate.name === call.name);

        calls.push({
          toolCallId: call.id,
          toolName: call.name,
          input: call.arguments,
          ...(tool ? { sourceInfo: tool.sourceInfo } : {})
        });
      }

      return { entries: await discover(calls, ctx.cwd, ctx.sessionManager) };
    } catch {
      return undefined;
    }
  });
  pi.on("session_start", async (_event, ctx) => {
    try {
      for (const message of await refresh(ctx.cwd, ctx.sessionManager)) {
        pi.sendMessage(message, { triggerTurn: false });
      }
    } catch {
      /* Discovery never prevents starting or reloading a session. */
    }
  });
}
