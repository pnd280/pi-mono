import { runTerminalLauncher } from "@pi-mono/libs/validation/terminal-launcher";

import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

process.exitCode = await runTerminalLauncher({
  args: process.argv.slice(2),
  help: `Usage: launch-terminal.ts <regular|fullscreen> [--reuse <directory>] [pi arguments...]

Creates an offline disposable workspace with jobs on and retains it for replay.
Prompts: delegate-reply, delegate-error, delegate-slow, delegate-stubborn,
         delegate-dialog, delegate-display, delegate-remember, capacity, job-barrier,
         job-stream`,
  createWorkspace: () =>
    createFixtureWorkspace({ settings: { "ext.pi-subagents": { jobs: true } } }),
  launch: fixtureLaunch,
  describe: (directory) => [
    `Fixture directory: ${directory}`,
    "Prompts: delegate-reply, delegate-error, delegate-slow, delegate-stubborn, delegate-dialog, delegate-display, delegate-remember, capacity, background-idle, background-slow, nested-background, nested-slow, activity-pair, job-barrier and job-stream (create job-release in the work directory to end them)"
  ]
});
