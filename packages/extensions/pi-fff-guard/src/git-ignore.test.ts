import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { inspectGitIgnore } from "./git-ignore.ts";
import { fixture } from "./test-fixture.ts";

type GitFixture = Awaited<ReturnType<typeof fixture>>;

describe("Git authority", () => {
  let directory: GitFixture;
  let external: GitFixture;

  beforeEach(async () => {
    directory = await fixture();
    external = await fixture();
  });

  afterEach(async () => {
    await Promise.all(
      [directory, external].map(({ root }) => rm(root, { recursive: true, force: true }))
    );
  });

  const inspect = (path: string, cwd: string) =>
    inspectGitIgnore({ path, cwd, signal: new AbortController().signal });
  const detect = (name: string) => inspect(join(directory.root, name), directory.root);

  it("uses final targets for nested negations, tracked exceptions, and immediate ignore edits", async () => {
    await directory.write(".gitignore", "node_modules/\n.tmp/*\n!.tmp/keep/\n");
    await directory.write(".tmp/keep/visible.ts");
    await directory.write(".tmp/keep/.gitignore", "*.log\n!retained.log\n");
    await directory.write(".tmp/keep/excluded.log");
    await directory.write(".tmp/keep/retained.log");
    expect((await detect(".tmp/keep/visible.ts")).status).toBe("not-ignored");
    expect((await detect(".tmp/keep/excluded.log")).status).toBe("ignored");
    expect((await detect(".tmp/keep/retained.log")).status).toBe("not-ignored");
    directory.git("add", "-f", "node_modules/dependency/package.json");
    expect((await detect("node_modules/dependency/package.json")).status).toBe("not-ignored");
    expect((await detect(".tmp/page.html")).status).toBe("ignored");
    await directory.write(".gitignore", "");
    expect((await detect(".tmp/page.html")).status).toBe("not-ignored");
    expect((await detect(".")).status).toBe("not-ignored");
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
    await symlink(".tmp/nested", join(directory.root, "nested-link"));
    expect((await detect("nested-link/file.ts")).status).toBe("ignored");
    expect((await inspect(join(external.root, "node_modules"), directory.root)).status).toBe(
      "ignored"
    );
    expect((await inspect(join(external.root, "src"), directory.root)).status).toBe("not-ignored");
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
    const worktree = join(directory.root, "linked-worktree");
    directory.git("worktree", "add", "--detach", "-q", worktree);
    await directory.write("linked-worktree/.gitignore", "ignored/\n");
    await directory.write("linked-worktree/ignored/file.ts");
    expect((await inspect(join(worktree, "ignored/file.ts"), worktree)).status).toBe("ignored");
  });

  it("checks dependency links lexically, then resolves non-ignored links without beyond-link errors", async () => {
    await directory.write("node_modules/.pnpm/linked/package.json");
    await symlink(".pnpm/linked", join(directory.root, "node_modules/linked"));
    expect((await detect("node_modules/linked/package.json")).status).toBe("ignored");
    await symlink(
      join(external.root, "node_modules/dependency"),
      join(directory.root, "dependency-link")
    );
    expect((await detect("dependency-link/package.json")).status).toBe("ignored");
    await symlink(join(external.root, "src"), join(directory.root, "source-link"));
    expect((await detect("source-link/main.ts")).status).toBe("not-ignored");
    await symlink("cycle", join(directory.root, "cycle"));
    expect((await detect("cycle")).status).toBe("unavailable");
    expect((await detect("node_modules/linked/missing.ts")).status).toBe("missing");
  });

  it("reports cancellation when the caller's signal aborts during inspection", async () => {
    const controller = new AbortController();
    const result = inspectGitIgnore({
      path: join(directory.root, "src/main.ts"),
      cwd: directory.root,
      signal: controller.signal
    });
    controller.abort();
    expect((await result).status).toBe("cancelled");
  });
});
