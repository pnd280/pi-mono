import { createReadToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSelectiveReadTool } from "./tool.ts";

export type { SelectiveReadParams } from "./tool.ts";

export default function piSelectiveRead(pi: Pick<ExtensionAPI, "registerTool">): void {
  pi.registerTool(createSelectiveReadTool(createReadToolDefinition(process.cwd())));
}
