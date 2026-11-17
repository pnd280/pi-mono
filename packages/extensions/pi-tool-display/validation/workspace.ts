import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

const marker = ".pi-tool-display-fixture";

export const UNPACED_ENV = "PI_TOOL_DISPLAY_FIXTURE_UNPACED";

export async function createFixtureWorkspace(): Promise<string> {
  return createValidationWorkspace("pi-tool-display-terminal-", async (directory) => {
    const work = join(directory, "work");
    await Promise.all(
      ["src", "a/nested", "b"].map((name) => mkdir(join(work, name), { recursive: true }))
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
        Array.from({ length: 80 }, (_, index) => `export const value${index} = ${index};\n`).join(
          ""
        )
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
  });
}

/** Unpaced launches skip the streaming pauses that make rows observable during manual checks. */
export async function fixtureLaunch(directory: string, { paced = true }: { paced?: boolean } = {}) {
  // `launch-terminal --reuse` accepts any directory that a maintainer types.
  const content = await readFile(join(directory, "work", marker), "utf8").catch(() => undefined);
  if (content !== "disposable tool-display workspace\n")
    throw new Error("Use the terminal fixture launcher to create a disposable workspace.");

  return createPiLaunch({
    directory,
    ...(paced ? {} : { env: { [UNPACED_ENV]: "1" } }),
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
