import { resolve, sep } from "node:path";

import { expect, it } from "vite-plus/test";

import { containsPath, expandHomePath, relativeDisplayPath } from "./paths.ts";

it("expands only home-prefixed paths using an explicit absolute home", () => {
  const home = resolve("/home/example");
  expect(expandHomePath("~", home)).toBe(home);
  expect(expandHomePath("~/folder/../file", home)).toBe(resolve(home, "file"));
  expect(expandHomePath("~other/file", home)).toBe("~other/file");
  expect(expandHomePath("folder/~", home)).toBe("folder/~");
  expect(() => expandHomePath("~/a", "relative")).toThrow(TypeError);
});

it("formats only lexical paths without interpreting tool prefixes, URLs, or globs", () => {
  const cwd = resolve("/workspace");
  expect(relativeDisplayPath(".", cwd)).toBe(".");
  expect(relativeDisplayPath(resolve(cwd, "a", "file name.ts"), cwd)).toBe("a/file name.ts");
  expect(relativeDisplayPath("../outside", cwd)).toBe(
    resolve(cwd, "../outside").split(sep).join("/")
  );
  expect(relativeDisplayPath("@file", cwd)).toBe("@file");
  expect(relativeDisplayPath("**/*.ts", cwd)).toBe("**/*.ts");
  expect(() => relativeDisplayPath("a", "relative")).toThrow(TypeError);
});

it("compares absolute lexical paths without confusing siblings or traversals with descendants", () => {
  const root = resolve("/workspace");
  expect(containsPath(root, root)).toBe(true);
  expect(containsPath(root, root + sep)).toBe(true);
  expect(containsPath(root, resolve(root, "a", "..", "b"))).toBe(true);
  expect(containsPath(root, resolve(root, ".."))).toBe(false);
  expect(containsPath(root, root + "-other")).toBe(false);
  expect(() => containsPath("relative", root)).toThrow(TypeError);
  expect(() => containsPath(root, "relative")).toThrow(TypeError);
});
