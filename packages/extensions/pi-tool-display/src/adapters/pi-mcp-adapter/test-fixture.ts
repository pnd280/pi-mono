import type { ToolInfo } from "@earendil-works/pi-coding-agent";

/** Registration shapes of the pi-mcp-adapter version that the adapter README names. No backend is loaded. */
export function mcpToolInfo(name = "mcp"): ToolInfo {
  const properties =
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
      : { query: { type: "string" } };

  return {
    name,
    exposure: "direct",
    description: "MCP fixture",
    parameters: { type: "object", properties },
    sourceInfo: {
      source: "npm:pi-mcp-adapter@2.33.0",
      path: "/agent/npm/node_modules/pi-mcp-adapter/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
