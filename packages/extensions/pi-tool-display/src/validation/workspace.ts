import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const marker = ".pi-tool-display-fixture";

export async function assertFixtureWorkspace(cwd: string): Promise<void> {
  if ((await readFile(join(cwd, marker), "utf8")) !== "disposable tool-display workspace\n")
    throw new Error("Use the terminal fixture launcher to create a disposable workspace.");
}

export async function createFixtureWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-tool-display-terminal-"));
  for (const name of ["work", "home", "agent", "tmp"]) await mkdir(join(directory, name));
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

/** Resolve the manifest's executable so manual and automated checks use the same bundle. */
export async function fixtureLaunch(directory: string) {
  const cwd = join(directory, "work");
  await assertFixtureWorkspace(cwd);
  const packageDirectory = dirname(
    dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")))
  );
  const manifest: unknown = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8")
  );
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    !("bin" in manifest) ||
    manifest.bin === null ||
    typeof manifest.bin !== "object" ||
    !("pi" in manifest.bin) ||
    typeof manifest.bin.pi !== "string"
  )
    throw new Error("Installed Pi package has no bin.pi executable.");
  return {
    command: process.execPath,
    args: [
      join(packageDirectory, manifest.bin.pi),
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
      fileURLToPath(new URL("../../index.ts", import.meta.url)),
      "-e",
      fileURLToPath(new URL("./provider.ts", import.meta.url))
    ],
    options: {
      cwd,
      env: {
        PATH: process.env.PATH,
        TERM: process.env.TERM ?? "xterm-256color",
        COLORTERM: process.env.COLORTERM,
        LANG: process.env.LANG ?? "en_US.UTF-8",
        HOME: join(directory, "home"),
        USERPROFILE: join(directory, "home"),
        TMPDIR: join(directory, "tmp"),
        TMP: join(directory, "tmp"),
        TEMP: join(directory, "tmp"),
        PI_CODING_AGENT_DIR: join(directory, "agent"),
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0"
      }
    }
  };
}
