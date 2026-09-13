import { readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { detectIgnored, runGit, type GitCommand } from "./git-ignore.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
let external: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
  external = await fixture();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    [directory, external].map(({ root }) => rm(root, { recursive: true, force: true }))
  );
});
const detect = (name: string) => detectIgnored(path.join(directory.root, name), directory.root);

it.each(["repository", "configuration"])(
  "isolates fixture writes from inherited Git %s selectors",
  async (selector) => {
    external.git("add", "src/main.ts");
    const configPath = path.join(external.root, ".git/config");
    const indexPath = path.join(external.root, ".git/index");
    const originalConfig = await readFile(configPath);
    const originalIndex = await readFile(indexPath);
    if (selector === "repository") {
      vi.stubEnv("GIT_DIR", path.join(external.root, ".git"));
      vi.stubEnv("GIT_WORK_TREE", external.root);
      vi.stubEnv("GIT_COMMON_DIR", path.join(external.root, ".git"));
      vi.stubEnv("GIT_INDEX_FILE", indexPath);
    } else vi.stubEnv("GIT_CONFIG", configPath);
    const isolated = await fixture();
    try {
      expect(await readFile(configPath)).toEqual(originalConfig);
      expect(isolated.git("rev-parse", "--show-toplevel").trim()).toBe(isolated.root);
      expect(isolated.git("config", "core.excludesFile").trim()).toBe(
        path.join(isolated.root, "global-excludes")
      );
      isolated.git("add", ".gitignore");
      expect(await readFile(indexPath)).toEqual(originalIndex);
      expect(isolated.git("ls-files").trim()).toBe(".gitignore");
    } finally {
      await rm(isolated.root, { recursive: true, force: true });
    }
  }
);

describe("Git authority", () => {
  it("uses final targets for nested negations, tracked exceptions, and immediate ignore edits", async () => {
    await directory.write(".gitignore", "node_modules/\n.tmp/*\n!.tmp/keep/\n");
    await directory.write(".tmp/keep/visible.ts");
    await directory.write(".tmp/keep/.gitignore", "*.log\n!retained.log\n");
    await directory.write(".tmp/keep/excluded.log");
    await directory.write(".tmp/keep/retained.log");
    expect((await detect(".tmp/keep/visible.ts")).status).toBe("allowed");
    expect((await detect(".tmp/keep/excluded.log")).status).toBe("ignored");
    expect((await detect(".tmp/keep/retained.log")).status).toBe("allowed");
    directory.git("add", "-f", "node_modules/dependency/package.json");
    expect((await detect("node_modules/dependency/package.json")).status).toBe("allowed");
    expect((await detect(".tmp/page.html")).status).toBe("ignored");
    await directory.write(".gitignore", "");
    expect((await detect(".tmp/page.html")).status).toBe("allowed");
    expect((await detect(".")).status).toBe("allowed");
  });

  it("respects info/exclude, configured global excludes, and literal NUL-delimited names", async () => {
    await directory.write(".git/info/exclude", "local-only\n");
    await directory.write("global-excludes", "global-only\n");
    await directory.write("local-only");
    await directory.write("global-only");
    expect((await detect("local-only")).status).toBe("ignored");
    expect((await detect("global-only")).status).toBe("ignored");
    const name = "node_modules/-quote'\n,$(command).json";
    await directory.write(name);
    expect((await detect(name)).status).toBe("ignored");
  });

  it("uses the outer workspace before nested repositories and external repositories' own rules", async () => {
    directory.git("init", "-q", ".tmp/nested");
    await directory.write(".tmp/nested/file.ts");
    expect((await detect(".tmp/nested/file.ts")).status).toBe("ignored");
    await symlink(".tmp/nested", path.join(directory.root, "nested-link"));
    expect((await detect("nested-link/file.ts")).status).toBe("ignored");
    expect(
      (await detectIgnored(path.join(external.root, "node_modules"), directory.root)).status
    ).toBe("ignored");
    expect((await detectIgnored(path.join(external.root, "src"), directory.root)).status).toBe(
      "allowed"
    );
    directory.git("add", "src/main.ts");
    directory.git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture"
    );
    const worktree = path.join(directory.root, "linked-worktree");
    directory.git("worktree", "add", "--detach", "-q", worktree);
    await directory.write("linked-worktree/.gitignore", "ignored/\n");
    await directory.write("linked-worktree/ignored/file.ts");
    expect((await detectIgnored(path.join(worktree, "ignored/file.ts"), worktree)).status).toBe(
      "ignored"
    );
  });

  it("checks dependency links lexically, then resolves non-ignored links without beyond-link errors", async () => {
    await directory.write("node_modules/.pnpm/linked/package.json");
    await symlink(".pnpm/linked", path.join(directory.root, "node_modules/linked"));
    expect((await detect("node_modules/linked/package.json")).status).toBe("ignored");
    await symlink(
      path.join(external.root, "node_modules/dependency"),
      path.join(directory.root, "dependency-link")
    );
    expect((await detect("dependency-link/package.json")).status).toBe("ignored");
    await symlink(path.join(external.root, "src"), path.join(directory.root, "source-link"));
    expect((await detect("source-link/main.ts")).status).toBe("allowed");
    await symlink("cycle", path.join(directory.root, "cycle"));
    expect((await detect("cycle")).status).toBe("unavailable");
    expect((await detect("node_modules/linked/missing.ts")).status).toBe("allowed");
  });

  it("fails open outside repositories and on process errors, malformed records, or deadlines", async () => {
    const outside = path.join(external.root, "outside");
    await rm(path.join(external.root, ".git"), { recursive: true, force: true });
    expect((await detectIgnored(external.root, external.root)).status).toBe("allowed");
    expect((await detectIgnored(outside, external.root)).status).toBe("allowed");
    const missing: GitCommand = async () => {
      throw new Error("spawn git ENOENT");
    };
    expect((await detectIgnored(directory.root, directory.root, undefined, missing)).status).toBe(
      "unavailable"
    );
    for (const stdout of [
      "bad",
      [".gitignore", "1", ".tmp/", "wrong-path", ""].join("\0"),
      ["", "1", ".tmp/", ".tmp", ""].join("\0"),
      [".gitignore", "", ".tmp/", ".tmp", ""].join("\0"),
      [".gitignore", "invalid", ".tmp/", ".tmp", ""].join("\0")
    ]) {
      const malformed: GitCommand = (cwd, args, input, signal) =>
        args[0] === "check-ignore"
          ? Promise.resolve({ code: 0, stdout, stderr: "" })
          : runGit(cwd, args, input, signal);
      expect(
        (
          await detectIgnored(
            path.join(directory.root, ".tmp"),
            directory.root,
            undefined,
            malformed
          )
        ).status,
        stdout
      ).toBe("unavailable");
    }
    const waiting: GitCommand = (_cwd, _args, _input, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      );
    const controller = new AbortController();
    const pending = detectIgnored(directory.root, directory.root, controller.signal, waiting);
    controller.abort();
    expect((await pending).status).toBe("cancelled");
    expect((await detectIgnored(directory.root, directory.root, undefined, waiting)).status).toBe(
      "unavailable"
    );
  });
});
