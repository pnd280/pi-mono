import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { BorrowedToolResult, InvocationPart, ToolDisplayAdapter } from "../../contracts.ts";
import { record } from "../../values.ts";
import { registeredBy } from "../provenance.ts";
import {
  mcpCallFacts,
  mcpCallIdentity,
  mcpNotices,
  mcpScriptSummary,
  mcpResultOutcome
} from "./result-presentation.ts";
import {
  argumentSchemas,
  gatewayActionSchema,
  gatewayArgsPropertySchema,
  nonemptyStringSchema,
  objectPropertySchema,
  requiredPropertiesSchema,
  resultDetailsSchema,
  stringPropertySchema,
  toolParametersSchema,
  type ToolKind
} from "./schemas.ts";

const optionalStringSchema = z.string().optional();
const numberSchema = z.number();

function nonempty(value: unknown): string | undefined {
  return nonemptyStringSchema.safeParse(value).data;
}

function gatewayMode(args: unknown): string {
  const data = record(args);
  const action = gatewayActionSchema.safeParse(data.action);
  if (action.success) return action.data;
  for (const key of ["tool", "connect", "describe", "instructions"])
    if (nonempty(data[key])) return key === "tool" ? "call" : key;
  if (data.search !== undefined) return "search";

  return nonempty(data.server) ? "list" : "status";
}

function supportsResult(kind: ToolKind, args: unknown, result: BorrowedToolResult): boolean {
  if (!argumentSchemas[kind].safeParse(args).success) return false;
  const parsed = resultDetailsSchema.safeParse(result.details);
  if (!parsed.success) return false;
  const details = parsed.data;
  if (
    (details.mode === "call" || kind === "direct") &&
    !optionalStringSchema.safeParse(details.tool).success
  )
    return false;
  if (nonempty(details.error)) return true;
  if (kind === "script") return details.mode === "script";
  if (kind === "gateway")
    return (
      details.mode === gatewayMode(args) ||
      (gatewayMode(args) === "connect" && details.mode === "list") ||
      (gatewayMode(args) === "ui-messages" && numberSchema.safeParse(details.sessions).success)
    );

  return !!nonempty(details.server) && (kind === "direct" || details.mode === "call");
}

function invocation(
  kind: ToolKind,
  name: string,
  args: unknown,
  result?: BorrowedToolResult
): InvocationPart[] {
  const data = record(args);
  const facts = mcpCallIdentity(result);
  let title = facts ? `${facts.server}.${facts.tool}` : name;
  let parameters = args;
  const parts: InvocationPart[] = [];

  if (kind === "gateway" || kind === "namespace") {
    const mode = kind === "namespace" ? "call" : gatewayMode(args);

    if (mode === "call") {
      if (!facts) {
        const server = nonempty(data.server) ?? (kind === "namespace" ? name : "mcp");
        title = `${server}.${nonempty(data.tool) ?? "…"}`;
      }

      // Retain JSON strings literally; display must not normalize or repair arguments.
      parameters = data.args ?? {};
    } else {
      title = `mcp ${mode}`;
      let target: unknown;
      if (mode === "search") target = data.search;
      else if (mode === "install") target = data.url;
      else target = data[mode] ?? data.server;
      if (typeof target === "string")
        parts.push(
          { kind: "annotation", text: " " },
          { kind: mode === "search" ? "pattern" : "value", text: target === "" ? '""' : target }
        );
    }
  }

  return [
    { kind: "value", text: title },
    ...parts,
    { kind: "parameters", value: parameters ?? {} }
  ];
}

function toolKind(tool: ToolInfo): ToolKind | undefined {
  const parsed = toolParametersSchema.safeParse(tool.parameters);
  if (!parsed.success) return undefined;
  const schema = parsed.data;
  const { properties } = schema;
  let kind: ToolKind = "direct";
  if (tool.name === "mcp") kind = "gateway";
  else if (tool.name === "mcpScript") kind = "script";
  else if (
    tool.name.startsWith("mcp__") &&
    tool.description.startsWith("Namespace-proxy for MCP server ")
  )
    kind = "namespace";
  const strings = {
    gateway: ["tool", "connect", "describe", "instructions", "search", "server", "action"],
    namespace: ["tool"],
    script: ["code"],
    direct: []
  }[kind];
  if (!strings.every((key) => stringPropertySchema.safeParse(properties[key]).success))
    return undefined;
  if (kind === "namespace" && !objectPropertySchema.safeParse(properties.args).success)
    return undefined;
  if (
    (kind === "namespace" || kind === "script") &&
    !requiredPropertiesSchema.safeParse(schema.required).data?.includes(strings[0])
  )
    return undefined;

  if (kind === "gateway" && !gatewayArgsPropertySchema.safeParse(properties.args).success)
    return undefined;

  return kind;
}

/** pi-mcp-adapter 2.33.0: registration provenance, then each public tool schema. */
export function piMcpAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || !registeredBy(tool, "pi-mcp-adapter")) return undefined;
  const kind = toolKind(tool);
  if (!kind) return undefined;

  return {
    id: `pi-mcp-adapter:${kind}`,
    family: "invocation",
    // MCP tool names alone may not explain the request.
    alwaysShowParameters: true,
    supports: (args, result) => supportsResult(kind, args, result),
    invocation: (args, result) => invocation(kind, tool.name, args, result),
    mcp: (_args, result) => mcpCallFacts(result),
    // Every MCP call counts once, including repeated identical requests.
    summaryItems: () => [{ category: "mcp" }],
    outcome: mcpResultOutcome,
    summary: mcpScriptSummary,
    notices: mcpNotices
  };
}
