import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadCompactConfig, type CompactConfig } from "./config.ts";
import { renderSummaryModel, summaryModelEntryType, type SummaryModelEntry } from "./entry.ts";
import { bindNativeCompaction } from "./native.ts";
import { compactionStatusKey, updateCompactionStatus } from "./status.ts";

export default function smartCompact(pi: ExtensionAPI) {
  pi.registerEntryRenderer(summaryModelEntryType, renderSummaryModel);
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
  let config: CompactConfig = {};
  let unavailable = "pi-smart-compact is not bound to an active session.";
  pi.on("session_start", (_event, ctx) => {
    binding?.dispose();
    binding = undefined;
    config = {};
    updateCompactionStatus(ctx);

    try {
      config = loadCompactConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
      binding = bindNativeCompaction(
        ctx.sessionManager,
        Object.keys(config).length ? { config, registry: ctx.modelRegistry } : undefined,
        (entry) => pi.appendEntry<SummaryModelEntry>(summaryModelEntryType, entry)
      );
    } catch (error) {
      unavailable =
        error instanceof Error ? error.message : "pi-smart-compact initialization failed.";
      throw error;
    }
  });
  // session_compact fires only after a compaction entry is persisted, so failures never count.
  pi.on("session_compact", (_event, ctx) => updateCompactionStatus(ctx));
  pi.on("session_tree", (_event, ctx) => updateCompactionStatus(ctx));
  // Boundary-proposed compactions persist without session_compact, after their handlers finish.
  pi.on("turn_start", (_event, ctx) => updateCompactionStatus(ctx));
  pi.on("agent_settled", (_event, ctx) => {
    binding?.clear();
    updateCompactionStatus(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    binding?.dispose();
    binding = undefined;
    config = {};
    ctx.ui.setStatus(compactionStatusKey, undefined);
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
    async execute(_id, args, signal, _onUpdate, ctx) {
      if (!binding) throw new Error(unavailable);
      binding.request(args.instructions, signal);
      const modelOverride = config.model;
      let thinkingLevel = config.thinkingLevel ?? pi.getThinkingLevel();

      if (modelOverride && config.thinkingLevel === undefined) {
        const slash = modelOverride.indexOf("/");
        const model = ctx.modelRegistry.find(
          modelOverride.slice(0, slash),
          modelOverride.slice(slash + 1)
        );
        if (model?.reasoning === false) thinkingLevel = "off";
      }

      return {
        content: [
          {
            type: "text",
            text: "Compaction requested."
          }
        ],
        details: { scheduled: true, ...(modelOverride ? { modelOverride, thinkingLevel } : {}) }
      };
    }
  });
}
