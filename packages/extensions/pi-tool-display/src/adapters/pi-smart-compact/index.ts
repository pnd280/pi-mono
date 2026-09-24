import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { InvocationPart, ToolDisplayAdapter } from "../../contracts.ts";
import { invocationParts, serializeParameters } from "../../invocation.ts";

const compactArgsSchema = z.strictObject({ instructions: z.string().nullish() });
const compactParametersSchema = z.object({
  type: z.literal("object"),
  required: z.tuple([]).optional(),
  properties: z.strictObject({ instructions: z.object({ type: z.literal("string") }) })
});
const compactDetailsSchema = z
  .object({
    scheduled: z.literal(true),
    modelOverride: z
      .string()
      .regex(/^[^/\s]+\/\S+$/u)
      .optional(),
    thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).optional()
  })
  .refine(
    (details) => (details.modelOverride === undefined) === (details.thinkingLevel === undefined)
  );

const contextArgsSchema = z.strictObject({});
const contextParametersSchema = z.object({
  type: z.literal("object"),
  required: z.tuple([]).optional(),
  properties: z.strictObject({})
});
const usageSchema = z.object({
  tokens: z.number().nonnegative().nullable(),
  contextWindow: z.number().positive(),
  percent: z.number().nonnegative().nullable()
});
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function parametersPart(args: unknown): InvocationPart {
  return {
    kind: "parameters",
    get text() {
      return ` (${serializeParameters(args)})`;
    }
  };
}

export const smartCompactDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-smart-compact:compact",
  family: "invocation",
  supports: (args) => compactArgsSchema.safeParse(args).success,
  headingVerbs: (args) =>
    compactArgsSchema.safeParse(args).success
      ? { action: "Request", pending: "Requesting", complete: "Requested" }
      : undefined,
  invocation(args) {
    const parsed = compactArgsSchema.safeParse(args).data;
    if (!parsed) return invocationParts("compact", args, "invocation");
    const parts: InvocationPart[] = [{ kind: "value", text: "compaction" }];
    const focus = parsed.instructions?.trim();
    if (focus) parts.push({ kind: "annotation", text: " \u2014 " }, { kind: "value", text: focus });
    parts.push(parametersPart(args));

    return parts;
  },
  textParts(text, args, { result, isError, isPartial, isCancelled }) {
    const details = compactDetailsSchema.safeParse(result.details).data;
    // Enrich only the published acknowledgement, never failures or arbitrary output.
    if (
      text === "Compaction requested." &&
      !isError &&
      !isPartial &&
      !isCancelled &&
      compactArgsSchema.safeParse(args).success &&
      details
    )
      return details.modelOverride
        ? [
            { kind: "annotation", text: "Model: " },
            { kind: "value", text: `${details.modelOverride}:${details.thinkingLevel}` }
          ]
        : [];

    return [{ kind: isError ? "error" : "output", text }];
  }
};

export const contextWindowDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-smart-compact:context_window",
  family: "invocation",
  supports: (args) => contextArgsSchema.safeParse(args).success,
  headingVerbs: (args) =>
    contextArgsSchema.safeParse(args).success
      ? { action: "Check", pending: "Checking", complete: "Checked" }
      : undefined,
  invocation: (args) =>
    contextArgsSchema.safeParse(args).success
      ? [{ kind: "value", text: "context window" }, parametersPart(args)]
      : invocationParts("context_window", args, "invocation"),
  summary(result, { args, outcome }) {
    if (outcome !== "success" || !contextArgsSchema.safeParse(args).success) return undefined;
    const usage = usageSchema.safeParse(result.details).data;
    if (!usage) return undefined;
    const capacity = numberFormat.format(usage.contextWindow);
    const tokens =
      usage.tokens === null
        ? `Usage unknown · ${capacity}-token window`
        : `${numberFormat.format(usage.tokens)} / ${capacity} tokens`;
    const percent = usage.percent === null ? "" : ` · ${numberFormat.format(usage.percent)}% used`;

    return { text: tokens + percent };
  }
};

/** Match the owning extension and each tool's parameter contract, not names alone. */
export function piSmartCompactAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || ["builtin", "sdk"].includes(tool.sourceInfo.source)) return undefined;
  const path = tool.sourceInfo.path.replaceAll("\\", "/");
  const owned =
    /^npm:pi-smart-compact(?:@[^/]+)?$/.test(tool.sourceInfo.source) ||
    /(?:^|\/)pi-smart-compact\/(?:src\/)?index\.[cm]?[jt]s$/.test(path);

  if (!owned) return undefined;
  if (tool.name === "compact" && compactParametersSchema.safeParse(tool.parameters).success)
    return smartCompactDisplayAdapter;
  if (tool.name === "context_window" && contextParametersSchema.safeParse(tool.parameters).success)
    return contextWindowDisplayAdapter;

  return undefined;
}
