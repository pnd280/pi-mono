import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
      env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }
    });

  const write = async (name: string, text = "fixture_marker\n") => {
    const absolute = path.join(root, name);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text);

    return absolute;
  };

  git("init", "-q");
  git("config", "core.excludesFile", await write("global-excludes", ""));
  await write(".gitignore", "node_modules/\n.tmp/\n");
  await write("src/main.ts");
  await write("node_modules/dependency/package.json", '{"name":"fixture_marker"}\n');
  await write(".tmp/page.html");

  return { root, git, write };
}
