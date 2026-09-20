import { createReadToolDefinition, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { selectionInputSchema } from "@pi-mono/utils/source-selection";
import { z } from "zod";

export function selectiveReadToolInfo(): ToolInfo {
  const native = createReadToolDefinition("/workspace");

  return {
    name: "read",
    description: "Read with a source selection",
    parameters: {
      ...native.parameters,
      properties: {
        ...native.parameters.properties,
        selection: z.toJSONSchema(selectionInputSchema)
      }
    },
    sourceInfo: {
      path: "/workspace/packages/extensions/pi-selective-read/index.ts",
      source: "local",
      scope: "user",
      origin: "package"
    }
  };
}
