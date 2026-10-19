import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";

const marker = ".pi-subagents-fixture";

export async function assertFixtureWorkspace(cwd: string): Promise<void> {
  if ((await readFile(join(cwd, marker), "utf8")) !== "disposable subagents workspace\n") {
    throw new Error("Create a disposable subagents fixture workspace first.");
  }
}

export async function createFixtureWorkspace(
  options: {
    settings?: Record<string, unknown>;
    projectSettings?: Record<string, unknown>;
    /** Fixture extensions that load before pi-subagents and the provider. */
    earlierExtensions?: string[];
    /** Fixture extensions that load after pi-subagents and the provider. */
    extensions?: string[];
  } = {}
): Promise<string> {
  return createValidationWorkspace("pi-subagents-", async (directory) => {
    await Promise.all([
      writeFile(join(directory, "work", marker), "disposable subagents workspace\n"),
      writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
          compaction: { enabled: false, keepRecentTokens: 1 },
          retry: { enabled: false },
          ...options.settings,
          extensions: [
            ...(options.earlierExtensions ?? []),
            fileURLToPath(new URL("./extension.ts", import.meta.url)),
            fileURLToPath(new URL("./provider.ts", import.meta.url)),
            ...(options.extensions ?? [])
          ]
        })
      )
    ]);

    if (options.projectSettings) {
      await mkdir(join(directory, "work", ".pi"));
      await writeFile(
        join(directory, "work", ".pi", "settings.json"),
        JSON.stringify(options.projectSettings)
      );
    }
  });
}

export async function fixtureLaunch(directory: string) {
  await assertFixtureWorkspace(join(directory, "work"));

  return createPiLaunch({
    directory,
    args: [
      "--provider",
      "subagents-fixture",
      "--model",
      "scripted",
      "--thinking",
      "off",
      "--approve"
    ]
  });
}
