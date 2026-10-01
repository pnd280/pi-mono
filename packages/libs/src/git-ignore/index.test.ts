import { rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { inspectGitIgnore, type GitCommand } from "./index.ts";
import { cleanupGitFixtures, createGitFixture, type GitFixture } from "./test-fixture.ts";

it("separates caller cancellation from a caller-supplied deadline", async () => {
  const waiting: GitCommand = (_cwd, _args, _input, signal) =>
    new Promise((_resolve, reject) => {
      signal.throwIfAborted();
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  const options = { path: resolve("."), cwd: resolve("."), timeoutMs: 10, git: waiting };
  const controller = new AbortController();
  const pending = inspectGitIgnore({ ...options, signal: controller.signal });
  controller.abort();
  expect(await pending).toEqual({ status: "cancelled" });
  expect(await inspectGitIgnore({ ...options, signal: controller.signal })).toEqual({
    status: "cancelled"
  });
  expect(await inspectGitIgnore(options)).toEqual({ status: "timed-out" });
});

it("retains inspection failures for consumer diagnostics and rejects invalid prerequisites", async () => {
  const cause = Object.assign(new Error("spawn git ENOENT\nwith details"), { code: "ENOENT" });

  const git: GitCommand = async () => {
    throw cause;
  };

  const options = { path: resolve("."), cwd: resolve("."), timeoutMs: 2000, git };
  expect(await inspectGitIgnore(options)).toEqual({ status: "unavailable", cause });
  await expect(inspectGitIgnore({ ...options, path: "relative" })).rejects.toThrow(TypeError);
  await expect(inspectGitIgnore({ ...options, timeoutMs: Infinity })).rejects.toThrow(RangeError);
});

describe("Git authority", () => {
  let directory: GitFixture;
  let external: GitFixture;

  beforeEach(async () => {
    directory = await createGitFixture();
    external = await createGitFixture();

    for (const fixture of [directory, external]) {
      await fixture.write(".gitignore", "node_modules/\n.tmp/\n");
      await fixture.write("src/main.ts");
      await fixture.write("node_modules/dependency/package.json", '{"name":"fixture"}\n');
      await fixture.write(".tmp/page.html");
    }
  });

  afterEach(cleanupGitFixtures);

  const detect = (name: string) =>
    inspectGitIgnore({
      path: join(directory.root, name),
      cwd: directory.root,
      timeoutMs: 2000
    });

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
    expect(
      (
        await inspectGitIgnore({
          path: join(external.root, "node_modules"),
          cwd: directory.root,
          timeoutMs: 2000
        })
      ).status
    ).toBe("ignored");
    expect(
      (
        await inspectGitIgnore({
          path: join(external.root, "src"),
          cwd: directory.root,
          timeoutMs: 2000
        })
      ).status
    ).toBe("not-ignored");
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
    expect(
      (
        await inspectGitIgnore({
          path: join(worktree, "ignored/file.ts"),
          cwd: worktree,
          timeoutMs: 2000
        })
      ).status
    ).toBe("ignored");
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

  it("distinguishes non-repositories, missing paths, and malformed records", async () => {
    const outside = join(external.root, "outside");
    await rm(join(external.root, ".git"), { recursive: true, force: true });
    expect(
      (await inspectGitIgnore({ path: external.root, cwd: external.root, timeoutMs: 2000 })).status
    ).toBe("not-ignored");
    expect(
      (await inspectGitIgnore({ path: outside, cwd: external.root, timeoutMs: 2000 })).status
    ).toBe("missing");

    for (const stdout of [
      "bad",
      [".gitignore", "1", ".tmp/", "wrong-path", ""].join("\0"),
      ["", "1", ".tmp/", ".tmp", ""].join("\0"),
      [".gitignore", "", ".tmp/", ".tmp", ""].join("\0"),
      [".gitignore", "invalid", ".tmp/", ".tmp", ""].join("\0")
    ]) {
      const malformed: GitCommand = async (_cwd, args) => ({
        code: 0,
        stdout: args[0] === "check-ignore" ? stdout : `${directory.root}\n`,
        stderr: ""
      });
      expect(
        (
          await inspectGitIgnore({
            path: join(directory.root, ".tmp"),
            cwd: directory.root,
            timeoutMs: 2000,
            git: malformed
          })
        ).status,
        stdout
      ).toBe("unavailable");
    }
  });
});
