import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type {
  BorrowedToolResult,
  DisplayNotice,
  McpFacts,
  ToolDisplayAdapter
} from "../../../contracts.ts";

const SOURCE_PATH = "builtin:mcp";
const NAME_PREFIX = "mcp__";

const argsSchema = z.record(z.string(), z.unknown());
// Pi projects every MCP input schema to an object schema with properties.
const parametersSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown())
});
const nonempty = z.string().min(1);
// Results and progress updates carry the unsanitized server and tool names.
const detailsSchema = z.object({
  server: nonempty,
  tool: nonempty,
  fullOutputPath: nonempty.optional()
});

function details(result: BorrowedToolResult | undefined) {
  return detailsSchema.safeParse(result?.details).data;
}

function mcpFacts(_args: unknown, result?: BorrowedToolResult): McpFacts | undefined {
  const identity = details(result);
  if (!identity || !result) return undefined;

  // Pi's error flag, not these facts, marks returned MCP errors as failures.
  return {
    server: identity.server,
    tool: identity.tool,
    outcome: "success",
    content: result.content.map((block) =>
      block.type === "text"
        ? { type: "text", text: block.text }
        : { type: "media", mimeType: block.mimeType }
    )
  };
}

function notices(result: BorrowedToolResult, expanded: boolean): DisplayNotice[] {
  // Expanded output already contains Pi's truncation warning and saved-output reference.
  const path = expanded ? undefined : details(result)?.fullOutputPath;

  return path
    ? [
        { kind: "warning", text: "MCP output truncated; expand to inspect retained output." },
        { kind: "reference", label: "Saved output", value: path }
      ]
    : [];
}

export const mcpToolDisplayAdapter: ToolDisplayAdapter = {
  id: "builtin:mcp",
  family: "invocation",
  // MCP tool names alone may not explain the request.
  alwaysShowParameters: true,
  // Thrown and blocked calls carry no details; other shapes are not Pi's.
  supports: (args, result) =>
    argsSchema.safeParse(args).success &&
    (result.details === undefined || detailsSchema.safeParse(result.details).success),
  mcp: mcpFacts,
  notices,
  summaryItems: () => [{ category: "mcp" }]
};

/** Match MCP server tools registered by Pi's built-in MCP extension; resource tools stay unmatched. */
export function builtinMcpAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (
    !tool?.name.startsWith(NAME_PREFIX) ||
    !tool.namespace?.name.startsWith(NAME_PREFIX) ||
    tool.sourceInfo.source !== "builtin" ||
    tool.sourceInfo.path !== SOURCE_PATH ||
    !parametersSchema.safeParse(tool.parameters).success
  )
    return undefined;

  return mcpToolDisplayAdapter;
}
