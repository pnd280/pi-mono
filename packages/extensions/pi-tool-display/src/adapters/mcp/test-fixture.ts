import type { ToolInfo } from "@earendil-works/pi-coding-agent";

/** Registration shapes inspected in pi-mcp-adapter 2.33.0. No backend is loaded. */
export function mcpToolInfo(name = "mcp"): ToolInfo {
  const properties: Record<string, unknown> =
    name === "mcp"
      ? Object.fromEntries<unknown>([
          ...[
            "tool",
            "connect",
            "describe",
            "instructions",
            "search",
            "server",
            "action",
            "url",
            "target"
          ].map((key) => [key, { type: "string" }] as const),
          [
            "args",
            {
              anyOf: [
                { type: "string" },
                { type: "object", properties: {}, additionalProperties: true }
              ]
            }
          ]
        ])
      : name === "mcpScript"
        ? { code: { type: "string" }, timeoutMs: { type: "number" } }
        : name === "mcp__docs"
          ? {
              tool: { type: "string" },
              args: { type: "object", properties: {}, additionalProperties: true }
            }
          : { query: { type: "string" } };

  return {
    name,
    description:
      name === "mcp__docs"
        ? 'Namespace-proxy for MCP server "docs". Forwards `{tool, args}` through the adapter\'s executeCall.'
        : "MCP fixture",
    parameters: {
      type: "object",
      properties,
      ...(name === "mcpScript"
        ? { required: ["code"] }
        : name === "mcp__docs"
          ? { required: ["tool"] }
          : {})
    },
    sourceInfo: {
      source: "npm:pi-mcp-adapter@2.33.0",
      path: "/agent/npm/node_modules/pi-mcp-adapter/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
