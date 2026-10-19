import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type {
  NestedCall,
  ResultTextPart,
  SummaryCategory,
  ToolDisplayAdapter
} from "../../../contracts.ts";

const TOOL_NAME = "codemode";
const SOURCE_PATH = "builtin:codemode";
// Pi writes this header as the first text block of every script result.
const SCRIPT_HEADER = /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/;

const argsSchema = z.strictObject({ code: z.string() });
const parametersSchema = z.object({
  type: z.literal("object"),
  required: z.tuple([z.literal("code")]),
  properties: z.strictObject({ code: z.object({ type: z.literal("string") }) })
});
const statuses = {
  running: "running",
  ok: "success",
  error: "failure",
  cancelled: "cancelled"
} as const satisfies Record<string, NestedCall["status"]>;
const detailsSchema = z.object({
  calls: z.array(
    z.object({
      name: z.string(),
      args: z.string(),
      status: z.enum(["running", "ok", "error", "cancelled"]),
      durationMs: z.number().optional(),
      error: z.string().optional(),
      cost: z.number().optional()
    })
  ),
  fullOutputPath: z.string().optional()
});

const scriptCategory: SummaryCategory = {
  id: "scripts",
  count: { one: "ran {n} script", other: "ran {n} scripts" }
};

export const codemodeDisplayAdapter: ToolDisplayAdapter = {
  id: "builtin:codemode",
  family: "invocation",
  supports: (args) => argsSchema.safeParse(args).success,
  headingVerbs: () => ({ action: "Script", pending: "Running script", complete: "Ran script" }),
  // The verbs name the tool; the script itself renders as code.
  invocation: () => [],
  code(args) {
    const code = argsSchema.safeParse(args).data?.code;

    return code === undefined ? undefined : { text: code, language: "javascript" };
  },
  nestedCalls(result) {
    return detailsSchema
      .safeParse(result.details)
      .data?.calls.map(({ status, ...call }) => ({ ...call, status: statuses[status] }));
  },
  textParts(text, _args, { contentIndex, isError }): ResultTextPart[] {
    if (contentIndex === 0 && SCRIPT_HEADER.test(text)) return [];

    return [{ kind: isError ? "error" : "output", text }];
  },
  // Expanded output already ends with Pi's full-output reference.
  notices(result, expanded) {
    const path = expanded
      ? undefined
      : detailsSchema.safeParse(result.details).data?.fullOutputPath;

    return path ? [{ kind: "reference", label: "Saved output", value: path }] : [];
  },
  // Count each script once; its nested calls never reach the transcript.
  summaryItems: () => [{ category: scriptCategory.id }],
  summaryCategories: [scriptCategory]
};

/** Match Pi's built-in `codemode` registration; SDK and replacement registrations stay unmatched. */
export function builtinCodemodeAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (
    tool?.name !== TOOL_NAME ||
    tool.sourceInfo.source !== "builtin" ||
    tool.sourceInfo.path !== SOURCE_PATH ||
    !parametersSchema.safeParse(tool.parameters).success
  )
    return undefined;

  return codemodeDisplayAdapter;
}
