import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

const [mode, ...args] = process.argv.slice(2);

if (mode === "--help") {
  console.log(`Usage: validate:terminal <regular|fullscreen> [--reuse <directory>] [pi arguments...]

Creates disposable files, settings, temporary output, and session history.
Prints their directory and retains it after exit for replay.
Use --reuse with that directory to reopen it without resetting files.
Additional arguments are passed to the installed Pi executable.
Prompts: explore, diff, output, cancel, images, public, mcp (requires MCP fixture setup)`);
} else if (mode !== "regular" && mode !== "fullscreen") {
  console.error("Choose regular or fullscreen; use --help for usage.");
  process.exitCode = 1;
} else {
  let directory: string;
  if (args[0] === "--reuse") {
    const existing = args[1];
    if (!existing || existing.startsWith("--")) throw new Error("--reuse requires a directory.");
    directory = resolve(existing);
    args.splice(0, 2);
  } else directory = await createFixtureWorkspace();
  const launch = await fixtureLaunch(directory);
  console.log(`Fixture directory: ${directory}`);
  console.log(
    "Prompts: explore, diff, output, cancel, images, public, mcp (requires MCP fixture setup)"
  );
  const child = spawn(launch.command, [...launch.args, "--tui-mode", mode, ...args], {
    ...launch.options,
    stdio: "inherit"
  });
  const exit: unknown[] = await once(child, "exit");
  const [code] = exit;
  process.exitCode = typeof code === "number" ? code : 1;
}
