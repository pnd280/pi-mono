import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Another extension that registers `bash` at session start, after pi-subagents opened its binding. */
export default function lateBash(pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.registerTool(createBashToolDefinition(process.cwd()));
  });
}
