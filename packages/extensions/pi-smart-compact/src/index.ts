import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { withCodemodeNotice } from "@pi-mono/libs/codemode-notice";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { z } from "zod";

import {
  findConfiguredModel,
  loadCompactConfig,
  selectRule,
  type CompactConfig
} from "./config.ts";
import { bindNativeCompaction } from "./native.ts";
import { compactAcknowledgement, type CompactDetails } from "./result.ts";
import { contextStatus } from "./status.ts";
import {
  renderSummaryModel,
  summaryModelEntryType,
  type SummaryModelEntry
} from "./summary-model-entry.ts";

const compactionStatusKey = "pi-smart-compact.compactions";

function updateCompactionStatus(ctx: ExtensionContext) {
  if (ctx.mode !== "tui") return;

  const count = ctx.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "compaction").length;

  ctx.ui.setStatus(
    compactionStatusKey,
    count > 0 ? ctx.ui.theme.fg("dim", `compacted ${count}×`) : undefined
  );
}

const contextWindowParameters = toToolSchema(z.object({}));

const compactInput = z.object({
  instructions: z.string().describe("What to preserve or emphasize in the summary.").optional()
});

const compactParameters = toToolSchema(compactInput);

/** Configured `docs` follow the built-in description. */
function contextWindowTool(docs: string) {
  return {
    name: "context_window",
    label: "Context window",
    description: ["Inspect the session context", ...(docs ? [docs] : [])].join("\n\n"),
    parameters: contextWindowParameters,
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
  } satisfies ToolDefinition<
    typeof contextWindowParameters,
    ReturnType<ExtensionContext["getContextUsage"]>
  >;
}

export default function smartCompact(pi: ExtensionAPI) {
  pi.registerEntryRenderer(summaryModelEntryType, renderSummaryModel);
  // Registered at load so Pi activates it before session_start handlers, such as profiles, choose the active tools. Without `--tools`, the session_start registration only replaces the description. With `--tools`, any registration reactivates every listed tool; a profile still wins because lifecycle startup commits run after every session_start handler.
  pi.registerTool(contextWindowTool(""));
  let binding: ReturnType<typeof bindNativeCompaction> | undefined;
  let config: CompactConfig = {};
  let statusStep = 0;
  let unavailable = "pi-smart-compact is not bound to an active session.";

  const status = (ctx: ExtensionContext) =>
    contextStatus(ctx.sessionManager.getBranch(), ctx.getContextUsage(), ctx.model, statusStep);

  pi.on("session_start", (_event, ctx) => {
    binding?.dispose();
    binding = undefined;
    config = {};
    statusStep = 0;
    let docs = "";
    updateCompactionStatus(ctx);

    try {
      ({
        docs = "",
        statusStep = 0,
        ...config
      } = loadCompactConfig(ctx.cwd, {
        projectTrusted: ctx.isProjectTrusted()
      }));
      binding = bindNativeCompaction(
        ctx.sessionManager,
        (entry) => pi.appendEntry<SummaryModelEntry>(summaryModelEntryType, entry),
        Object.keys(config).length ? { config, registry: ctx.modelRegistry } : undefined
      );
    } catch (error) {
      unavailable =
        error instanceof Error ? error.message : "pi-smart-compact: initialization failed.";
      // Rethrowing makes Pi render the full stack; the message alone is actionable and already names the extension.
      if (ctx.hasUI) ctx.ui.notify(unavailable, "error");
    }

    // Settings are read here, after project trust is known; this replaces the description.
    pi.registerTool(contextWindowTool(docs));
  });
  // The two points where the model's next response can still act on a status: before a run's first request, and after each response.
  pi.on("before_agent_start", (_event, ctx) => {
    const message = status(ctx);

    return message && { message };
  });
  pi.on("turn_end", (event, ctx) => {
    // Usage is read from the saved branch, so it predates a compaction that an earlier handler proposed. A status saved after that compaction would carry the old count and hide the boundaries below it.
    if (event.outcome !== "completed" || event.entries.some((entry) => entry.type === "compaction"))
      return undefined;
    const message = status(ctx);

    return message && { entries: [...event.entries, { type: "custom_message", ...message }] };
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
    statusStep = 0;
    if (ctx.mode === "tui") ctx.ui.setStatus(compactionStatusKey, undefined);
  });
  pi.registerTool(
    withCodemodeNotice({
      name: "compact",
      exposure: "model-only",
      label: "Compact context",
      description: "Compact the session context",
      parameters: compactParameters,
      async execute(_id, args, signal, _onUpdate, ctx) {
        if (!binding) throw new Error(unavailable);
        const parsed = compactInput.safeParse(args);
        if (!parsed.success) throw new Error("Invalid compact parameters");
        binding.request(parsed.data.instructions, signal);
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
          content: [{ type: "text", text: compactAcknowledgement }],
          details: {
            scheduled: true,
            ...(modelOverride ? { modelOverride, thinkingLevel } : {})
          } satisfies CompactDetails
        };
      }
    })
  );
}
