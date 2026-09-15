import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord } from "../src/model.ts";

export async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-prompt-manager-terminal-"));

  for (const name of ["work", "agent", "home", "bin", "tmp"])
    await mkdir(join(directory, name), { mode: 0o700 });
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
      retry: { enabled: false },
      "ext.pi-prompt-manager": { customMessageTypes: ["allow"] }
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
  const packageDirectory = dirname(
    dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")))
  );
  const manifest: unknown = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8")
  );

  if (!isRecord(manifest) || !isRecord(manifest.bin) || typeof manifest.bin.pi !== "string")
    throw new Error("Installed Pi executable is unavailable.");

  return {
    command: process.execPath,
    args: [
      join(packageDirectory, manifest.bin.pi),
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
    options: {
      cwd: join(directory, "work"),
      env: {
        PATH: `${join(directory, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        HOME: join(directory, "home"),
        USERPROFILE: join(directory, "home"),
        TMPDIR: join(directory, "tmp"),
        TERM: process.env.TERM ?? "xterm-256color",
        LANG: process.env.LANG ?? "en_US.UTF-8",
        PI_CODING_AGENT_DIR: join(directory, "agent"),
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0",
        WAYLAND_DISPLAY: "isolated-fixture",
        DISPLAY: ":fixture"
      }
    }
  };
}
