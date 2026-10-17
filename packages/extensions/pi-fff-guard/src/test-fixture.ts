import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import path from "node:path";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";

export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "fff-guard-"));
  // Fixture writes must never target a parent Git process's repository or config.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" },
      timeout: STEP_TIMEOUT_MS
    });

  const write = async (name: string, text = "fixture_marker\n") => {
    const absolute = path.join(root, name);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text);

    return absolute;
  };

  try {
    git("init", "-q");
    git("config", "core.excludesFile", await write("global-excludes", ""));
    await write(".gitignore", "node_modules/\n.tmp/\n");
    await write("src/main.ts");
    await write("node_modules/dependency/package.json", '{"name":"fixture_marker"}\n');
    await write(".tmp/page.html");
  } catch (error) {
    // Callers receive no root to clean up when setup fails.
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return { root, git, write };
}
