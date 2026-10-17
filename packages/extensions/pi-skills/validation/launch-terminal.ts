import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { runTerminalLauncher } from "@pi-mono/libs/validation/terminal-launcher";

const packageDirectory = resolve(import.meta.dirname, "..");
const marker = ".pi-skills-fixture";
const markerText = "pi-skills fixture\n";

process.exitCode = await runTerminalLauncher({
  args: process.argv.slice(2),
  help: "Usage: launch-terminal.ts <regular|fullscreen> [--reuse <fixture-directory>] [Pi arguments...]\nOffline skill-completion fixture with review and release skills and sample.txt; retains the fixture after exit.",
  async createWorkspace() {
    return createValidationWorkspace("pi-skills-terminal-", async (directory) => {
      const skillDirectory = join(directory, "skills");
      await mkdir(skillDirectory, { mode: 0o700 });

      for (const name of ["review", "release"]) {
        await writeFile(
          join(skillDirectory, `${name}.md`),
          `---\nname: ${name}\ndescription: Offline ${name} fixture\n---\nSkill body must not be injected.\n`
        );
      }

      await writeFile(join(directory, "work", "sample.txt"), "Offline attachment fixture\n");
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({ theme: "dark", enableSkillCommands: true, quietStartup: true })
      );
      await writeFile(join(directory, marker), markerText);
    });
  },
  async launch(directory) {
    if ((await readFile(join(directory, marker), "utf8")) !== markerText)
      throw new Error("Not a pi-skills fixture directory.");

    return createPiLaunch({
      directory,
      args: [
        "--offline",
        "--no-session",
        "--no-tools",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-approve",
        "-e",
        packageDirectory,
        "-e",
        join(packageDirectory, "validation/observe.ts"),
        "--skill",
        join(directory, "skills")
      ],
      env: { XDG_CONFIG_HOME: join(directory, "home", ".config") }
    });
  },
  describe: (directory) => [
    `Fixture: ${directory}`,
    "Submitted text is captured in work/inputs.jsonl and handled without a model request.",
    "Edit skills/*.md and use /reload to check catalog freshness. Fixture is retained after exit."
  ]
});
