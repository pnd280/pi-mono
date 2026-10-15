import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { assertFixtureWorkspace } from "./workspace.ts";

/** Another extension that owns `bash`, as an override package would. */
export default async function foreignBash(pi: ExtensionAPI): Promise<void> {
  await assertFixtureWorkspace(process.cwd());
  pi.registerTool(createBashToolDefinition(process.cwd()));
}
