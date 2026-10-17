import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { runTerminalLauncher } from "@pi-mono/libs/validation/terminal-launcher";

process.exitCode = await runTerminalLauncher({
  args: process.argv.slice(2),
  help: "Usage: launch-terminal.ts <regular|fullscreen> [--reuse <fixture-directory>] [Pi arguments...]\nOffline working-message fixture. Submit seed, then hold to inspect the composed working message.",
  async createWorkspace() {
    return createValidationWorkspace("pi-working-message-", async (directory) => {
      await writeFile(join(directory, ".working-message-fixture"), "working-message fixture\n");
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
          "ext.pi-todo": { collapseWidgetByDefault: true },
          workingMessage: {
            order: [
              "pi-todo.activity",
              "fixture.status",
              "fixture.inactive",
              "unavailable.activity"
            ]
          },
          compaction: { enabled: false },
          retry: { enabled: false },
          enableAnalytics: false,
          enableInstallTelemetry: false
        })
      );
    });
  },
  async launch(directory) {
    if (
      (await readFile(join(directory, ".working-message-fixture"), "utf8")) !==
      "working-message fixture\n"
    )
      throw new Error("Not a working-message fixture directory.");

    return createPiLaunch({
      directory,
      args: [
        "--offline",
        "--no-extensions",
        "--no-skills",
        "--no-context-files",
        "--no-themes",
        "--approve",
        "--no-session",
        "--provider",
        "working-message-fixture",
        "--model",
        "offline",
        "--no-builtin-tools",
        "-e",
        fileURLToPath(new URL("../index.ts", import.meta.url)),
        "-e",
        fileURLToPath(new URL("./working-message.ts", import.meta.url))
      ]
    });
  },
  describe: (directory) => [
    `Fixture: ${directory}`,
    "Use /working-message, /todos expand, /todos collapse, and /fixture-status [text].",
    "Submit pages for 40 long todos and a scrollable transcript, then open /todos."
  ]
});
