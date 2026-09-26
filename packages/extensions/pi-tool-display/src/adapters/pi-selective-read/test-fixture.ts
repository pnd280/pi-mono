import { Type } from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { selectionInputSchema } from "@pi-mono/utils/source-selection";

export function selectiveReadToolInfo(): ToolInfo {
  const native = createReadToolDefinition("/workspace");

  return {
    name: "read",
    description: "Read with a source selection",
    parameters: Type.Object({
      ...native.parameters.properties,
      selection: Type.Optional(toToolSchema(selectionInputSchema))
    }),
    sourceInfo: {
      path: "/workspace/packages/extensions/pi-selective-read/index.ts",
      source: "local",
      scope: "user",
      origin: "package"
    }
  };
}
