import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  findConfiguredModel,
  loadCompactConfig,
  selectRule,
  type CompactConfig
} from "./config.ts";
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
        (entry) => pi.appendEntry<SummaryModelEntry>(summaryModelEntryType, entry),
        Object.keys(config).length ? { config, registry: ctx.modelRegistry } : undefined
      );
    } catch (error) {
      unavailable =
        error instanceof Error ? error.message : "pi-smart-compact initialization failed.";
      // Rethrowing makes Pi render the full stack; the message alone is actionable and already
      // names the extension.
      if (ctx.hasUI) ctx.ui.notify(unavailable, "error");
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
    exposure: "model-only",
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
      const rule = ctx.model && selectRule(config, ctx.model);
      const modelOverride = rule?.model;
      let thinkingLevel = rule?.thinkingLevel ?? pi.getThinkingLevel();

      if (
        modelOverride &&
        rule.thinkingLevel === undefined &&
        findConfiguredModel(ctx.modelRegistry, modelOverride)?.reasoning === false
      )
        thinkingLevel = "off";

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
