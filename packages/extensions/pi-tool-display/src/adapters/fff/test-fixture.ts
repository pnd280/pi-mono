import type { ToolInfo } from "@earendil-works/pi-coding-agent";

export function fffToolInfo(name: string, multi = false): ToolInfo {
  return {
    name,
    description: "FFF",
    parameters: {
      type: "object",
      properties: { [multi ? "patterns" : "pattern"]: { type: multi ? "array" : "string" } }
    },
    sourceInfo: {
      source: "npm:@ff-labs/pi-fff@0.10.6",
      path: "/fff/src/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
