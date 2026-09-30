import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { InvocationPart, SummaryCategory, ToolDisplayAdapter } from "../../../contracts.ts";
import { invocationParts, serializeParameters } from "../../../invocation.ts";

const TOOL_NAME = "tool_search";
const SOURCE_PATH = "builtin:tool-search";

const argsSchema = z.strictObject({ query: z.string(), limit: z.number().optional() });
const parametersSchema = z.object({
  type: z.literal("object"),
  required: z.tuple([z.literal("query")]),
  properties: z.strictObject({
    query: z.object({ type: z.literal("string") }),
    limit: z.object({ type: z.literal("number") })
  })
});
const detailsSchema = z.object({ loaded: z.array(z.string()) });

const loadedCategory: SummaryCategory = {
  id: "loaded-tools",
  count: { one: "loaded {n} tool", other: "loaded {n} tools" }
};

function parametersPart(args: unknown): InvocationPart {
  return {
    kind: "parameters",
    get text() {
      return ` (${serializeParameters(args)})`;
    }
  };
}

export const toolSearchDisplayAdapter: ToolDisplayAdapter = {
  id: "builtin:tool-search",
  family: "invocation",
  supports: (args) => argsSchema.safeParse(args).success,
  headingVerbs: () => ({ action: "Search", pending: "Searching", complete: "Searched" }),
  invocation(args) {
    const parsed = argsSchema.safeParse(args).data;
    if (!parsed) return invocationParts(TOOL_NAME, args, "invocation");
    const parts: InvocationPart[] = [{ kind: "value", text: "tools" }];
    const query = parsed.query.trim();
    if (query)
      parts.push({ kind: "annotation", text: " \u2014 " }, { kind: "pattern", text: query });
    parts.push(parametersPart(args));

    return parts;
  },
  summary(result, { args, outcome, expanded }) {
    // Expanded cards show the original text, which already lists every loaded tool.
    if (expanded || outcome !== "success" || !argsSchema.safeParse(args).success) return undefined;
    const loaded = detailsSchema.safeParse(result.details).data?.loaded;
    if (!loaded) return undefined;
    if (loaded.length === 0) return { text: "No matching tools" };

    return {
      text: `Loaded ${loaded.length} tool${loaded.length === 1 ? "" : "s"}: ${loaded.join(", ")}`
    };
  },
  // Count loaded tools once by name; calls that loaded nothing count per call as `tool_search`.
  summaryItems(_args, { result }) {
    const loaded = detailsSchema.safeParse(result?.details).data?.loaded;

    return loaded && loaded.length > 0
      ? loaded.map((name) => ({ category: loadedCategory.id, identity: name }))
      : undefined;
  },
  summaryCategories: [loadedCategory]
};

/** Match Pi's built-in `tool_search` registration; SDK and replacement registrations stay unmatched. */
export function builtinToolSearchAdapter(
  tool: ToolInfo | undefined
): ToolDisplayAdapter | undefined {
  if (
    tool?.name !== TOOL_NAME ||
    tool.sourceInfo.source !== "builtin" ||
    tool.sourceInfo.path !== SOURCE_PATH ||
    !parametersSchema.safeParse(tool.parameters).success
  )
    return undefined;

  return toolSearchDisplayAdapter;
}
