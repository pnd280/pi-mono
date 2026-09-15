import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

const marker = ".pi-tool-display-fixture";

export async function assertFixtureWorkspace(cwd: string): Promise<void> {
  if ((await readFile(join(cwd, marker), "utf8")) !== "disposable tool-display workspace\n")
    throw new Error("Use the terminal fixture launcher to create a disposable workspace.");
}

export async function createFixtureWorkspace(): Promise<string> {
  const directory = await createValidationWorkspace("pi-tool-display-terminal-");
  const work = join(directory, "work");
  await Promise.all([
    writeFile(join(work, marker), "disposable tool-display workspace\n"),
    writeFile(join(work, "a.ts"), 'export const label = "before";\n'),
    writeFile(
      join(work, "b.ts"),
      Array.from({ length: 80 }, (_, index) => `export const value${index} = ${index};\n`).join("")
    ),
    writeFile(
      join(work, "image.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC",
        "base64"
      )
    ),
    writeFile(
      join(directory, "agent", "settings.json"),
      JSON.stringify({
        compaction: { enabled: false },
        retry: { enabled: false },
        images: { autoResize: false },
        "ext.pi-tool-display": { showParameters: false }
      })
    )
  ]);

  return directory;
}

export async function fixtureLaunch(directory: string) {
  const cwd = join(directory, "work");
  await assertFixtureWorkspace(cwd);

  return createPiLaunch({
    directory,
    args: [
      "--offline",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--no-themes",
      "--approve",
      "--provider",
      "display-fixture",
      "--model",
      "scripted",
      "--tools",
      "read,ls,bash,edit,write,display_fixture_read",
      "--session",
      join(directory, "session.jsonl"),
      "-e",
      fileURLToPath(new URL("../index.ts", import.meta.url)),
      "-e",
      fileURLToPath(new URL("./provider.ts", import.meta.url))
    ]
  });
}
