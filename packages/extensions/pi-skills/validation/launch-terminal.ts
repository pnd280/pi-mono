import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

const packageDirectory = resolve(import.meta.dirname, "..");
const directory = await createValidationWorkspace("pi-skills-terminal-");
const cwd = join(directory, "work");
const agentDir = join(directory, "agent");
const skillDirectory = join(directory, "skills");
await mkdir(skillDirectory, { mode: 0o700 });

for (const name of ["review", "release"]) {
  await writeFile(
    join(skillDirectory, `${name}.md`),
    `---\nname: ${name}\ndescription: Offline ${name} fixture\n---\nSkill body must not be injected.\n`
  );
}

await writeFile(join(cwd, "sample.txt"), "Offline attachment fixture\n");
await writeFile(
  join(agentDir, "settings.json"),
  JSON.stringify({ theme: "dark", enableSkillCommands: true, quietStartup: true })
);
console.log(`Fixture: ${directory}`);
console.log("Submitted text is captured in work/inputs.jsonl and handled without a model request.");
console.log(
  "Edit skills/*.md and use /reload to check catalog freshness. Fixture is retained after exit."
);
const launch = await createPiLaunch({
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
    skillDirectory,
    ...process.argv.slice(2)
  ],
  env: { XDG_CONFIG_HOME: join(directory, "home", ".config") }
});
const child = spawn(launch.command, launch.args, { ...launch.options, stdio: "inherit" });
const exit: unknown[] = await once(child, "exit");
const [code] = exit;
process.exitCode = typeof code === "number" ? code : 1;
