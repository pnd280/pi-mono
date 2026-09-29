import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { FffToolKind } from "@pi-mono/utils/fff-tools";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { evaluateSearch } from "./evaluate-search.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
});
afterEach(async () => {
  await rm(directory.root, { recursive: true, force: true });
});

const toolNames: Record<FffToolKind, string> = {
  find: "fffind",
  grep: "ffgrep",
  multi: "fff-multi-grep"
};

const decision = (kind: FffToolKind, input: Record<string, unknown>) =>
  evaluateSearch({
    kind,
    toolName: toolNames[kind],
    input,
    cwd: directory.root
  });

async function expectIgnored(kind: FffToolKind, input: Record<string, unknown>) {
  const result = await decision(kind, input);
  expect(result.kind).toBe("block");
  if (result.kind !== "block") throw new Error("Expected an ignored-path block.");
  expect(result.reason).toContain("Git-ignored");
}

async function expectAllowed(kind: FffToolKind, input: Record<string, unknown>) {
  expect(await decision(kind, input)).toStrictEqual({ kind: "allow" });
}

describe("FFF search scopes", () => {
  it("blocks ignored explicit paths and rooted globs in supported path forms", async () => {
    for (const searchPath of [
      "node_modules/dependency/package.json",
      "./node_modules/",
      " node_modules/ ",
      path.join(directory.root, ".tmp/**/*.html"),
      `../${path.basename(directory.root)}/node_modules/`,
      `~/${path.relative(homedir(), directory.root)}/node_modules/`
    ]) {
      await expectIgnored("grep", { path: searchPath });
    }

    await expectIgnored("find", { pattern: "node_modules/** package" });
  });

  it("expands brace scopes even if a literal brace-named path exists, without requiring glob matches", async () => {
    await directory.write("{src,node_modules}/literal.ts");

    await expectIgnored("grep", { path: "{src,node_modules}" });
    await expectIgnored("multi", { constraints: "{src,node_modules}/**" });
    await expectIgnored("grep", { path: "node_modules/**/*.missing" });
    await expectAllowed("grep", { path: "src/{missing,also-missing}.ts" });
    await expectAllowed("grep", { path: "{src,missing}/**" });
  });

  it("does not reject fuzzy queries, recursive filenames, or unrooted filters", async () => {
    for (const [kind, input] of [
      ["find", { pattern: "node_modules" }],
      ["find", { pattern: "**/node_modules/**" }],
      ["grep", { pattern: "node_modules/", cursor: "fff_c1" }],
      ["find", { cursor: "fff_c1" }],
      ["grep", { path: "." }],
      ["grep", { path: "missing.ts" }],
      ["grep", { path: "./missing.ts" }],
      ["grep", { path: path.join(directory.root, "missing.ts") }],
      ["grep", { path: "*.ts" }],
      ["grep", { path: "src/**/*.missing" }],
      ["multi", { patterns: ["node_modules/"] }],
      ["multi", { constraints: "*.ts !node_modules/ !missing/" }]
    ] satisfies Array<[FffToolKind, Record<string, unknown>]>) {
      await expectAllowed(kind, input);
    }
  });

  it("blocks missing explicit paths and glob roots before checking ignore rules", async () => {
    await directory.write("src/LICENSE");

    for (const searchPath of [
      "src/LICENSE",
      "missing/",
      "./src/missing.ts",
      "src/main.ts/child",
      "node_modules/missing",
      "node_modules/missing/**/*.ts",
      "{missing,also-missing}/**",
      `~/${path.relative(homedir(), directory.root)}/missing`
    ]) {
      expect(await decision("grep", { path: searchPath }), searchPath).toStrictEqual({
        kind: "block",
        reason: "No such file or directory"
      });
    }

    expect(await decision("find", { pattern: "./missing.ts" })).toStrictEqual({
      kind: "block",
      reason: "No such file or directory"
    });
    expect(await decision("multi", { constraints: "src/ missing/" })).toStrictEqual({
      kind: "block",
      reason: "No such file or directory"
    });
  });

  it("allows wholly excluded ignored scopes but blocks partially excluded ones", async () => {
    await expectAllowed("grep", {
      path: "{src,node_modules}/**",
      exclude: "node_modules/,*.min.js"
    });
    await expectAllowed("grep", { path: ".tmp/**", exclude: ".tmp/**" });
    await expectAllowed("grep", { path: ".tmp/page.html", exclude: "**/*.html" });
    await expectAllowed("grep", { path: ".tmp/**/*.html", exclude: "*.html" });
    await expectAllowed("grep", {
      path: ".tmp/page.html",
      exclude: path.join(directory.root, ".tmp/**/*.html")
    });
    await expectAllowed("grep", {
      path: "node_modules/dependency/package.json",
      exclude: ["!*.json", "src/"]
    });
    await expectAllowed("find", { path: ".tmp/page.html", pattern: "*.ts" });
    await expectAllowed("find", { path: "node_modules/", pattern: "*.ts", exclude: "*.ts" });
    await expectAllowed("multi", { constraints: "*.ts node_modules/ !*.ts" });
    await expectIgnored("grep", { path: "node_modules/", exclude: "node_modules/dependency/" });
    await expectIgnored("grep", { path: ".tmp/**", exclude: ". **" });
    await expectIgnored("multi", { constraints: "{src,node_modules}/** !src/" });
  });

  it("retains only searchable intersections regardless of constraint order", async () => {
    for (const constraints of [
      "node_modules/** node_modules/**/*.ts !*.ts",
      "node_modules/**/*.ts node_modules/** !*.ts",
      "node_modules/**/*.{ts,js} node_modules/**/*.ts !*.ts",
      "node_modules/**/*.ts node_modules/**/*.{ts,js} !*.ts",
      "node_modules/**/*.ts node_modules/dependency/ !*.ts",
      "node_modules/**/*.ts node_modules/dependency/package.json",
      "src/ node_modules/"
    ]) {
      await expectAllowed("multi", { constraints });
    }

    await expectIgnored("multi", {
      constraints: "node_modules/**/*.{ts,js} node_modules/dependency/ !*.ts"
    });
    await expectIgnored("multi", { constraints: "node_modules/ node_modules/dependency/" });
  });

  it("keeps spaces and commas in an existing explicit find pattern", async () => {
    const searchPath = "node_modules/a, b/file.ts";
    await directory.write(searchPath);

    await expectIgnored("find", { pattern: searchPath });
  });
});
