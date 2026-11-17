import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Another extension that owns `bash`, as an override package would. */
export default function foreignBash(pi: ExtensionAPI): void {
  pi.registerTool(createBashToolDefinition(process.cwd()));
}
