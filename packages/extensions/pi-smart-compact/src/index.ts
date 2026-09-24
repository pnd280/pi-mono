import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { bindNativeCompaction } from "./native.ts";

export default function smartCompact(pi: ExtensionAPI) {
  pi.registerTool({
    name: "context_window",
    label: "Context window",
    description: "Inspect the session context",
    parameters: Type.Object({}),
    async execute(_id, _args, _signal, _onUpdate, ctx) {
      const usage = ctx.getContextUsage();

      return {
        content: [
          {
            type: "text",
            text: usage === undefined ? "Context usage unavailable." : JSON.stringify(usage)
          }
        ],
        details: usage
      };
    }
  });
  let binding: ReturnType<typeof bindNativeCompaction> | undefined;
  let unavailable = "pi-smart-compact is not bound to an active session.";
  pi.on("session_start", (_event, ctx) => {
    binding?.dispose();
    binding = undefined;

    try {
      binding = bindNativeCompaction(ctx.sessionManager);
    } catch (error) {
      unavailable =
        error instanceof Error ? error.message : "pi-smart-compact initialization failed.";
      throw error;
    }
  });
  pi.on("agent_settled", () => binding?.clear());
  pi.on("session_shutdown", () => {
    binding?.dispose();
    binding = undefined;
  });
  pi.registerTool({
    name: "compact",
    label: "Compact context",
    description: "Compact the session context",
    parameters: Type.Object({
      instructions: Type.Optional(
        Type.String({
          description: "What to preserve or emphasize in the summary."
        })
      )
    }),
    async execute(_id, args, signal) {
      if (!binding) throw new Error(unavailable);
      binding.request(args.instructions, signal);

      return {
        content: [
          {
            type: "text",
            text: "Compaction requested."
          }
        ],
        details: { scheduled: true }
      };
    }
  });
}
