import { rm, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { detectIgnored, runGit, type GitCommand } from "./git-ignore.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
let external: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
  external = await fixture();
});
afterEach(async () => {
  await Promise.all(
    [directory, external].map(({ root }) => rm(root, { recursive: true, force: true }))
  );
});
const detect = (name: string) => detectIgnored(path.join(directory.root, name), directory.root);

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
    const global = await detect("global-only");
    expect(global.status).toBe("ignored");
    if (global.status === "ignored")
      expect(global.record.source).toBe(path.join(directory.root, "global-excludes"));
    const name = "node_modules/-quote'\n,$(command).json";
    await directory.write(name);
    const result = await detect(name);
    expect(result.status).toBe("ignored");
    if (result.status === "ignored")
      expect(result.record.path).toBe(path.join(directory.root, name));
  });

  it("uses the outer workspace before nested repositories and external repositories' own rules", async () => {
    directory.git("init", "-q", ".tmp/nested");
    await directory.write(".tmp/nested/file.ts");
    expect((await detect(".tmp/nested/file.ts")).status).toBe("ignored");
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
    const malformed: GitCommand = (cwd, args, input, signal) =>
      args[0] === "check-ignore"
        ? Promise.resolve({ code: 0, stdout: "bad", stderr: "" })
        : runGit(cwd, args, input, signal);
    expect(
      (await detectIgnored(path.join(directory.root, ".tmp"), directory.root, undefined, malformed))
        .status
    ).toBe("unavailable");
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
