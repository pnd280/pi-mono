import { runTerminalLauncher } from "@pi-mono/libs/validation/terminal-launcher";

import { createWorkspace, launch } from "./workspace.ts";

process.exitCode = await runTerminalLauncher({
  args: process.argv.slice(2),
  help: "Usage: validate:terminal <regular|fullscreen> [--reuse <fixture-directory>] [Pi arguments...]\nCreates isolated settings, prompt collections, and a clipboard capture file; retains the fixture after exit.\nSubmit user prompts and /raw-template to exercise capture.",
  createWorkspace,
  launch,
  describe: (directory) => [
    `Fixture: ${directory}`,
    "Clipboard helpers write only to this fixture's clipboard.txt."
  ]
});
