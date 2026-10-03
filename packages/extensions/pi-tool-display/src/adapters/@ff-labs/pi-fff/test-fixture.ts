import type { ToolInfo } from "@earendil-works/pi-coding-agent";

export function fffToolInfo(name: string): ToolInfo {
  return {
    name,
    exposure: "direct",
    description: "FFF",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" } }
    },
    sourceInfo: {
      source: "npm:@ff-labs/pi-fff@0.10.6",
      path: "/fff/src/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
