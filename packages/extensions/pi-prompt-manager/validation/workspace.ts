import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

export async function createWorkspace(): Promise<string> {
  const directory = await createValidationWorkspace("pi-prompt-manager-terminal-");
  await mkdir(join(directory, "bin"), { mode: 0o700 });
  await writeFile(join(directory, ".prompt-manager-fixture"), "offline prompt-manager fixture\n", {
    mode: 0o600
  });
  await mkdir(join(directory, "agent", "prompts"), { mode: 0o700 });
  await writeFile(
    join(directory, "agent", "prompts", "raw-template.md"),
    "Expanded template content for offline validation."
  );
  await writeFile(
    join(directory, "agent", "settings.json"),
    JSON.stringify({
      compaction: { enabled: false },
      retry: { enabled: false }
    }),
    { mode: 0o600 }
  );
  // These isolated helpers never contact the user's real clipboard server.
  const helper = `#!${process.execPath}\nconst{writeFileSync}=require('node:fs');const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>writeFileSync(${JSON.stringify(join(directory, "clipboard.txt"))},Buffer.concat(chunks),{mode:0o600}));\n`;

  for (const name of ["wl-copy", "xclip", "xsel", "pbcopy", "powershell.exe"])
    await writeFile(join(directory, "bin", name), helper, { mode: 0o700 });

  return directory;
}

export async function launch(directory: string) {
  if (
    (await readFile(join(directory, ".prompt-manager-fixture"), "utf8")) !==
    "offline prompt-manager fixture\n"
  )
    throw new Error("Not a prompt-manager fixture directory.");

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
      "prompt-fixture",
      "--model",
      "offline",
      "--no-tools",
      "-e",
      fileURLToPath(new URL("../index.ts", import.meta.url)),
      "-e",
      fileURLToPath(new URL("./provider.ts", import.meta.url))
    ],
    env: {
      PATH: `${join(directory, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      WAYLAND_DISPLAY: "isolated-fixture",
      DISPLAY: ":fixture"
    }
  });
}
