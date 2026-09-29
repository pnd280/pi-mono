import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { JsonObject } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { fffSource, fixture } from "./fixture.ts";
import { inferScope } from "./scopes.ts";

let fs: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  fs = await fixture();
});
afterEach(async () => {
  await fs.dispose();
});

const scopes = async (name: string, input: JsonObject, fff = false) => {
  const result = await inferScope(fs.call(name, input, fff ? fffSource : undefined), fs.cwd);

  return {
    directories: result.directories.map((value) => path.relative(fs.cwd, value)),
    reads: result.reads.map((value) => path.relative(fs.cwd, value))
  };
};

it("uses file parents and directory targets, without requiring a successful call", async () => {
  await fs.write("pkg/deep/file.ts");
  expect(await scopes("read", { path: "pkg/deep/file.ts", selection: { startLine: 2 } })).toEqual({
    directories: ["pkg", "pkg/deep"],
    reads: []
  });
  expect(await scopes("ls", { path: "pkg/deep" })).toEqual({
    directories: ["pkg", "pkg/deep"],
    reads: []
  });
  expect(await scopes("read", { path: "pkg/missing/AGENTS.md", limit: 1 })).toEqual({
    directories: ["pkg", "pkg/missing"],
    reads: ["pkg/missing/AGENTS.md"]
  });
  expect(await scopes("read", { path: "AGENTS.md" })).toEqual({ directories: [], reads: [] });
  expect(await scopes("read", { path: "../outside/AGENTS.md" })).toEqual({
    directories: [],
    reads: []
  });
});

it("normalizes Pi's native @ prefixes and file URLs before marking direct reads", async () => {
  const file = await fs.write("pkg/AGENTS.md");

  for (const value of ["@pkg/AGENTS.md", pathToFileURL(file).href]) {
    expect(await scopes("read", { path: value })).toEqual({
      directories: ["pkg"],
      reads: ["pkg/AGENTS.md"]
    });
  }
});

it("does not traverse symlink destinations' ancestor chains", async () => {
  await fs.write("../outside/deep/file.ts");
  await symlink(path.join(fs.root, "outside/deep"), path.join(fs.cwd, "alias"));
  expect(await scopes("read", { path: "alias/file.ts" })).toEqual({
    directories: ["alias"],
    reads: []
  });
});

it("infers finite static glob prefixes, not matches, fuzzy names, or content patterns", async () => {
  expect(await scopes("find", { pattern: "{src,lib}/deep/**/*.ts" })).toEqual({
    directories: ["lib", "src", "lib/deep", "src/deep"],
    reads: []
  });
  expect(
    await scopes("grep", { path: "pkg", glob: "deep/*.ts", pattern: "other/AGENTS.md" })
  ).toEqual({ directories: ["pkg", "pkg/deep"], reads: [] });
  expect(await scopes("grep", { pattern: "pkg/AGENTS.md" })).toEqual({
    directories: [],
    reads: []
  });
  expect(await scopes("find", { pattern: "**/AGENTS.md" })).toEqual({ directories: [], reads: [] });
  expect(await scopes("edit", { path: "pkg/AGENTS.md" })).toEqual({ directories: [], reads: [] });
});

it.each(["ffgrep", "multi_grep"])("marks explicit FFF content reads through %s", async (name) => {
  const multi = name.includes("multi");
  expect(
    await scopes(
      name,
      multi
        ? { constraints: "pkg/AGENTS.md", patterns: ["anything"] }
        : { path: "pkg/AGENTS.md", pattern: "anything" },
      true
    )
  ).toEqual({ directories: ["pkg"], reads: ["pkg/AGENTS.md"] });
});

it("respects FFF filename filters, exclusions, overrides, and cursor-only inputs", async () => {
  await mkdir(path.join(fs.cwd, "profile"));

  for (const input of [
    { pattern: "profile" },
    { path: "./AGENTS.md" },
    { path: path.join(fs.cwd, "AGENTS.md") },
    { cursor: "opaque" },
    { pattern: "**/*.ts", exclude: "pkg/**" }
  ]) {
    expect(await scopes("fffind", input, true)).toEqual({ directories: [], reads: [] });
  }

  expect(await scopes("find", { path: "pkg/deep/", pattern: "profile" }, true)).toEqual({
    directories: ["pkg", "pkg/deep"],
    reads: []
  });
  expect(
    await scopes("fffind", { pattern: "{src,lib}/** !external/**", exclude: "other/" }, true)
  ).toEqual({ directories: ["lib", "src"], reads: [] });
  expect(await scopes("fffind", { path: "pkg/AGENTS.md" }, true)).toEqual({
    directories: ["pkg"],
    reads: []
  });
});

it("preserves existing FFF filename-query paths with spaces", async () => {
  await fs.write("pkg space/deep/file.ts");
  expect(await scopes("fffind", { pattern: "pkg space/deep/file.ts" }, true)).toEqual({
    directories: ["pkg space", "pkg space/deep"],
    reads: []
  });
});

it("infers literal Bash reads across quoting, options, pipes, and cd chains", async () => {
  expect(
    await scopes("bash", {
      command: "cd 'pkg space' && cat AGENTS.md | head -n 3; sed -n '1,5p' deep/CLAUDE.md"
    })
  ).toEqual({
    directories: ["pkg space", "pkg space/deep"],
    reads: ["pkg space/AGENTS.md", "pkg space/deep/CLAUDE.md"]
  });
  expect(
    await scopes("bash", {
      command:
        "grep -n -e 'content/AGENTS.md' pkg/AGENTS.md; awk -v x=1 '{ print $0 }' lib/CLAUDE.md"
    })
  ).toEqual({ directories: ["lib", "pkg"], reads: ["pkg/AGENTS.md", "lib/CLAUDE.md"] });
  expect(
    await scopes("bash", {
      command: "ls pkg/AGENTS.md; find lib/ -name AGENTS.md; fd AGENTS.md src/; rg --files more/"
    })
  ).toEqual({ directories: ["lib", "more", "pkg", "src"], reads: [] });
  // Optional-argument `--color` must not consume a path; `-NUM` is a head/tail count.
  expect(
    await scopes("bash", {
      command: "grep --color x pkg/AGENTS.md; ls --color lib/; head -20 src/CLAUDE.md"
    })
  ).toEqual({ directories: ["lib", "pkg", "src"], reads: ["pkg/AGENTS.md", "src/CLAUDE.md"] });
});

it("keeps path operands after empty attached long-option values", async () => {
  expect(await scopes("bash", { command: "grep --regexp= pkg/AGENTS.md" })).toEqual({
    directories: ["pkg"],
    reads: ["pkg/AGENTS.md"]
  });
});

it("recognizes input redirection, descriptor duplication, and positive rg glob scopes without interpreting excludes", async () => {
  expect(
    await scopes("bash", {
      command:
        "head -n 1 < pkg/AGENTS.md 2>&1 | tail -n 1; rg term -g 'lib/deep/**' -g '!excluded/**' >&2"
    })
  ).toEqual({
    directories: ["lib", "pkg", "lib/deep"],
    reads: ["pkg/AGENTS.md"]
  });
});

it("preserves quoted or escaped leading tildes as literal Bash paths", async () => {
  await fs.write("~/pkg/AGENTS.md");

  for (const command of ["cat '~/pkg/AGENTS.md'", "cat \\~/pkg/AGENTS.md"]) {
    expect(await scopes("bash", { command })).toEqual({
      directories: ["~", "~/pkg"],
      reads: ["~/pkg/AGENTS.md"]
    });
  }
});

it("does not mark redirected stdin as read by filename-listing commands", async () => {
  expect(
    await scopes("bash", { command: "ls pkg/ < pkg/AGENTS.md; rg --files lib/ < lib/AGENTS.md" })
  ).toEqual({
    directories: ["lib", "pkg"],
    reads: []
  });
});

it("does not interpret embedded scripts, substitutions, unknown options, non-stdin inputs, or output destinations", async () => {
  for (const command of [
    "cat $FILE",
    "cat $(pwd)/pkg/AGENTS.md",
    "python -c 'open(\"pkg/AGENTS.md\").read()'",
    "bash -c 'cat pkg/AGENTS.md'",
    "cat --unknown pkg/AGENTS.md",
    "cat <<EOF\ncat pkg/AGENTS.md\nEOF",
    "for f in pkg/*; do cat pkg/AGENTS.md; done",
    "echo anything > pkg/AGENTS.md",
    "cat 3< pkg/AGENTS.md"
  ]) {
    expect(await scopes("bash", { command })).toEqual({ directories: [], reads: [] });
  }

  expect(await scopes("bash", { command: "cat pkg/AGENTS.md > output/AGENTS.md" })).toEqual({
    directories: ["pkg"],
    reads: ["pkg/AGENTS.md"]
  });
  expect(await scopes("bash", { command: "cd pkg || cat other/AGENTS.md" })).toEqual({
    directories: ["pkg"],
    reads: []
  });
});
