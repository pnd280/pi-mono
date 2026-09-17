import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

const marker = ".pi-tool-display-fixture";

export async function assertFixtureWorkspace(cwd: string): Promise<void> {
  if ((await readFile(join(cwd, marker), "utf8")) !== "disposable tool-display workspace\n")
    throw new Error("Use the terminal fixture launcher to create a disposable workspace.");
}

export async function createFixtureWorkspace(): Promise<string> {
  const directory = await createValidationWorkspace("pi-tool-display-terminal-");
  const work = join(directory, "work");
  await Promise.all(
    ["src", "a/nested", "b"].map((name) => mkdir(join(work, name), { recursive: true }))
  );
  // FFF needs nonignored inputs in its own repository, never the workspace's .git.
  await promisify(execFile)(
    "git",
    ["-c", "init.defaultBranch=fixture", "init", "--quiet", "--template=", work],
    {
      cwd: work,
      env: { PATH: process.env.PATH, HOME: join(directory, "home"), GIT_CONFIG_NOSYSTEM: "1" }
    }
  );
  await Promise.all(
    [
      "a/alpha.txt",
      "a/beta.txt",
      "a/space name.txt",
      "a/unicode-☃.txt",
      "a/this-is-a-deliberately-long-filename-for-wrapping-and-tree-connectors.txt",
      "a/nested/nested.txt",
      "b/gamma.txt"
    ].map((name) =>
      writeFile(
        join(work, name),
        Array.from({ length: 40 }, (_, index) => `${index + 1} alpha value in ${name}\n`).join("")
      )
    )
  );
  await Promise.all([
    writeFile(join(work, "src", "c.ts"), "export const value = 1;\n"),
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

  await copyFile(join(work, "image.png"), join(work, "a", "image.png"));

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
      "read,ls,grep,bash,edit,write,display_fixture_read",
      "--session",
      join(directory, "session.jsonl"),
      "-e",
      fileURLToPath(new URL("../index.ts", import.meta.url)),
      "-e",
      fileURLToPath(new URL("./provider.ts", import.meta.url))
    ]
  });
}
