import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { assertFixtureWorkspace } from "./workspace.ts";

/** Another extension that registers `bash` at session start, after pi-subagents opened its binding. */
export default async function lateBash(pi: ExtensionAPI): Promise<void> {
  await assertFixtureWorkspace(process.cwd());
  pi.on("session_start", () => {
    pi.registerTool(createBashToolDefinition(process.cwd()));
  });
}
