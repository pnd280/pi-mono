import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";

import { record, type InvocationPart } from "../../presentation.ts";
import type { ToolDisplayAdapter } from "../types.ts";
import { mcpCallFacts, mcpCallIdentity, mcpNotices } from "./result-presentation.ts";

type ToolKind = "gateway" | "namespace" | "script" | "direct";

function isObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function gatewayMode(args: unknown): string {
  const data = record(args);
  if (
    typeof data.action === "string" &&
    ["install", "ui-messages", "auth-start", "auth-complete"].includes(data.action)
  )
    return data.action;
  for (const key of ["tool", "connect", "describe", "instructions"])
    if (nonempty(data[key])) return key === "tool" ? "call" : key;
  if (data.search !== undefined) return "search";

  return nonempty(data.server) ? "list" : "status";
}

function supportsArgs(kind: ToolKind, args: unknown): boolean {
  if (!isObject(args)) return false;
  const data = record(args);
  if (kind === "direct") return true;
  if (kind === "script") return typeof data.code === "string";
  if (kind === "namespace")
    return !!nonempty(data.tool) && (data.args === undefined || isObject(data.args));

  return (
    [
      "tool",
      "connect",
      "describe",
      "instructions",
      "search",
      "server",
      "action",
      "url",
      "target"
    ].every((key) => data[key] === undefined || typeof data[key] === "string") &&
    (data.args === undefined || typeof data.args === "string" || isObject(data.args))
  );
}

function supportsResult(kind: ToolKind, args: unknown, result: AgentToolResult<unknown>): boolean {
  if (!supportsArgs(kind, args) || !isObject(result.details)) return false;
  const details = record(result.details);
  if (
    !["error", "server", "mode"].every(
      (key) => details[key] === undefined || typeof details[key] === "string"
    )
  )
    return false;
  if (
    (details.mode === "call" || kind === "direct") &&
    details.tool !== undefined &&
    typeof details.tool !== "string"
  )
    return false;
  if (nonempty(details.error)) return true;
  if (kind === "script") return details.mode === "script";
  if (kind === "gateway")
    return (
      details.mode === gatewayMode(args) ||
      (gatewayMode(args) === "connect" && details.mode === "list") ||
      (gatewayMode(args) === "ui-messages" && typeof details.sessions === "number")
    );

  return !!nonempty(details.server) && (kind === "direct" || details.mode === "call");
}

function invocation(
  kind: ToolKind,
  name: string,
  args: unknown,
  result?: AgentToolResult<unknown>
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
      const target =
        mode === "search"
          ? data.search
          : mode === "install"
            ? data.url
            : (data[mode] ?? data.server);
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
    { kind: "parameters", text: `(${JSON.stringify(parameters ?? {})})` }
  ];
}

function toolKind(tool: ToolInfo): ToolKind | undefined {
  const schema = record(tool.parameters);
  if (schema.type !== "object" || !isObject(schema.properties)) return undefined;
  const properties = record(schema.properties);
  const kind: ToolKind =
    tool.name === "mcp"
      ? "gateway"
      : tool.name === "mcpScript"
        ? "script"
        : tool.name.startsWith("mcp__") &&
            tool.description.startsWith("Namespace-proxy for MCP server ")
          ? "namespace"
          : "direct";
  const strings =
    kind === "gateway"
      ? ["tool", "connect", "describe", "instructions", "search", "server", "action"]
      : kind === "namespace"
        ? ["tool"]
        : kind === "script"
          ? ["code"]
          : [];
  if (!strings.every((key) => record(properties[key]).type === "string")) return undefined;
  if (kind === "namespace" && record(properties.args).type !== "object") return undefined;
  if (
    (kind === "namespace" || kind === "script") &&
    (!Array.isArray(schema.required) || !schema.required.includes(strings[0]))
  )
    return undefined;

  if (kind === "gateway") {
    const variants = record(properties.args).anyOf;
    if (
      !Array.isArray(variants) ||
      !["string", "object"].every((type) =>
        variants.some((value: unknown) => record(value).type === type)
      )
    )
      return undefined;
  }

  return kind;
}

/** pi-mcp-adapter 2.33.0: registration provenance, then each public tool schema. */
export function officialMcpAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || ["builtin", "sdk"].includes(tool.sourceInfo.source)) return undefined;
  const owned =
    /^npm:pi-mcp-adapter(?:@[^/]+)?$/.test(tool.sourceInfo.source) ||
    /(?:^|\/)pi-mcp-adapter\/index\.[cm]?[jt]s$/.test(tool.sourceInfo.path.replaceAll("\\", "/"));
  const kind = owned ? toolKind(tool) : undefined;
  if (!kind) return undefined;

  return {
    id: `mcp:${kind}`,
    family: "invocation",
    supports: (args, result) => supportsResult(kind, args, result),
    invocation: (args, result) => invocation(kind, tool.name, args, result),
    mcp: (_args, result) => mcpCallFacts(result),
    notices: mcpNotices
  };
}
