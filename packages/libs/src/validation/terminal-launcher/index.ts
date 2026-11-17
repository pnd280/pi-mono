import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { z } from "zod";

import type { PiLaunch } from "../pi-process/index.ts";

const modeSchema = z.enum(["regular", "fullscreen"]);
const reuseDirectorySchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("--"));

type TerminalLauncherOptions = {
  args: readonly string[];
  help: string;
  createWorkspace(): Promise<string>;
  launch(directory: string): Promise<PiLaunch>;
  describe(directory: string): readonly string[];
};

/** Run a consumer-validated fixture in the current terminal and return its exit code. */
export async function runTerminalLauncher(options: TerminalLauncherOptions): Promise<number> {
  const [mode, ...args] = options.args;

  if (mode === "--help") {
    console.log(options.help);

    return 0;
  }

  const parsedMode = modeSchema.safeParse(mode);

  if (!parsedMode.success) {
    console.error("Choose regular or fullscreen; use --help for usage.");

    return 1;
  }

  let directory: string;
  if (args[0] === "--reuse") {
    const existing = reuseDirectorySchema.safeParse(args[1]);

    if (!existing.success) {
      console.error("--reuse requires a fixture directory; use --help for usage.");

      return 1;
    }

    directory = resolve(existing.data);
    args.splice(0, 2);
  } else directory = await options.createWorkspace();
  // Consumers validate the marker before any process starts, including reused directories.
  const launch = await options.launch(directory);
  for (const message of options.describe(directory)) console.log(message);
  const child = spawn(launch.command, [...launch.args, "--tui-mode", parsedMode.data, ...args], {
    ...launch.options,
    stdio: "inherit"
  });
  const exit: unknown[] = await once(child, "exit");
  const [code] = exit;

  return typeof code === "number" ? code : 1;
}
