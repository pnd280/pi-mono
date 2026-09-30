import type { ToolInfo } from "@earendil-works/pi-coding-agent";

/** Registration shapes inspected in pi-mcp-adapter 2.33.0. No backend is loaded. */
export function mcpToolInfo(name = "mcp"): ToolInfo {
  let properties: Record<string, unknown>;
  let required: string[] | undefined;

  if (name === "mcp") {
    properties = Object.fromEntries<unknown>([
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
    ]);
  } else if (name === "mcpScript") {
    properties = { code: { type: "string" }, timeoutMs: { type: "number" } };
    required = ["code"];
  } else if (name === "mcp__docs") {
    properties = {
      tool: { type: "string" },
      args: { type: "object", properties: {}, additionalProperties: true }
    };
    required = ["tool"];
  } else properties = { query: { type: "string" } };

  return {
    name,
    exposure: "direct",
    description:
      name === "mcp__docs"
        ? 'Namespace-proxy for MCP server "docs". Forwards `{tool, args}` through the adapter\'s executeCall.'
        : "MCP fixture",
    parameters: {
      type: "object",
      properties,
      ...(required ? { required } : {})
    },
    sourceInfo: {
      source: "npm:pi-mcp-adapter@2.33.0",
      path: "/agent/npm/node_modules/pi-mcp-adapter/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
