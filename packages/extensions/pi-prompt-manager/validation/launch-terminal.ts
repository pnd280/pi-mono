import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createWorkspace, launch } from "./workspace.ts";

const [mode, ...args] = process.argv.slice(2);

if (mode === "--help") {
  console.log(
    "Usage: validate:terminal <regular|fullscreen> [--reuse <fixture-directory>] [Pi arguments...]\nCreates isolated settings, prompt collections, and a clipboard capture file; retains the fixture after exit.\nUse /raw-template, with-custom, and /fixture-custom to exercise capture."
  );
} else if (mode !== "regular" && mode !== "fullscreen") {
  console.error("Choose regular or fullscreen; use --help for usage.");
  process.exitCode = 1;
} else {
  let directory: string;

  if (args[0] === "--reuse") {
    const path = args[1];

    if (!path || path.startsWith("--")) throw new Error("--reuse requires a fixture directory.");
    directory = resolve(path);
    args.splice(0, 2);
  } else directory = await createWorkspace();
  const command = await launch(directory);
  console.log(`Fixture: ${directory}`);
  console.log("Clipboard helpers write only to this fixture's clipboard.txt.");
  const child = spawn(command.command, [...command.args, "--tui-mode", mode, ...args], {
    ...command.options,
    stdio: "inherit"
  });
  const exit: unknown[] = await once(child, "exit");
  const code = exit[0];
  process.exitCode = typeof code === "number" ? code : 1;
}
