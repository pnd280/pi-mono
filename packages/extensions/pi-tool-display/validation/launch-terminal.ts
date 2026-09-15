import { runTerminalLauncher } from "@pi-mono/libs/validation/terminal-launcher";

import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

process.exitCode = await runTerminalLauncher({
  args: process.argv.slice(2),
  help: `Usage: validate:terminal <regular|fullscreen> [--reuse <directory>] [pi arguments...]

Creates disposable files, settings, temporary output, and session history.
Prints their directory and retains it after exit for replay.
Use --reuse with that directory to reopen it without resetting files.
Additional arguments are passed to the installed Pi executable.
Prompts: explore, diff, output, cancel, images, public, mcp (requires MCP fixture setup)`,
  createWorkspace: createFixtureWorkspace,
  launch: fixtureLaunch,
  describe: (directory) => [
    `Fixture directory: ${directory}`,
    "Prompts: explore, diff, output, cancel, images, public, mcp (requires MCP fixture setup)"
  ]
});
