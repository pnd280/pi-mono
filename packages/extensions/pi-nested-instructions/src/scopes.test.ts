import { symlink } from "node:fs/promises";
import path from "node:path";

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
  const result = await inferScope(
    { toolCallId: "scope", toolName: name, input, ...(fff ? { sourceInfo: fffSource } : {}) },
    fs.cwd
  );

  // Scope membership matters here; discovery tests cover broad-to-narrow delivery.
  return {
    directories: result.directories.map((value) => path.relative(fs.cwd, value)).sort(),
    reads: result.reads.map((value) => path.relative(fs.cwd, value)).sort()
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
  expect(await scopes("read", { path: "pkg/deep" })).toEqual({
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

it("does not traverse symlink destinations' ancestor chains", async () => {
  await fs.write("../outside/deep/file.ts");
  await symlink(path.join(fs.root, "outside/deep"), path.join(fs.cwd, "alias"));
  expect(await scopes("read", { path: "alias/file.ts" })).toEqual({
    directories: ["alias"],
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
