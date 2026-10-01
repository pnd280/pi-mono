import { expect, it } from "vite-plus/test";

import {
  alternatives,
  globRoot,
  hasGlob,
  normalizeFffPath,
  parseFffScopes
} from "./search-scopes.ts";

it("expands only finite brace alternatives and bounds combinatorial inputs", () => {
  expect([...alternatives("{src,lib}/{a,b}/**")].sort()).toEqual([
    "lib/a/**",
    "lib/b/**",
    "src/a/**",
    "src/b/**"
  ]);
  expect(alternatives("src/{1..4}/**")).toEqual(["src/{1..4}/**"]);
  expect(alternatives("src/{1..4}/{a,b}")).toEqual(["src/{1..4}/a", "src/{1..4}/b"]);
  expect(() => alternatives("{a,b}".repeat(7))).toThrow();
});

it("preserves existing explicit filename-query paths and omits bare fuzzy words", () => {
  expect(parseFffScopes("find", { pattern: "pkg space/file.ts" }, "/work", true)).toEqual({
    expressions: [
      { source: "query", value: "pkg space/file.ts", directoryOnly: false, validatePath: false }
    ],
    exclusions: []
  });
  expect(parseFffScopes("find", { pattern: "pkg/** profile" }, "/work", false)).toEqual({
    expressions: [{ source: "query", value: "pkg/**", directoryOnly: false, validatePath: true }],
    exclusions: []
  });
  expect(parseFffScopes("find", { pattern: "two words" }, "/work", true)).toEqual({
    expressions: [],
    exclusions: []
  });
});

it("separates negative query terms and explicit paths without interpreting content patterns", () => {
  expect(
    parseFffScopes(
      "find",
      {
        path: " ./file.ts ",
        pattern: "fuzzy src/name.ts ./missing.ts ~/pkg/ src/{a,b}/** !tmp/**"
      },
      "/work",
      false
    )
  ).toEqual({
    expressions: [
      { source: "path", value: "file.ts", directoryOnly: false, validatePath: true },
      { source: "query", value: "src/name.ts", directoryOnly: false, validatePath: false },
      { source: "query", value: "./missing.ts", directoryOnly: false, validatePath: true },
      { source: "query", value: "~/pkg/", directoryOnly: true, validatePath: true },
      { source: "query", value: "src/{a,b}/**", directoryOnly: false, validatePath: true }
    ],
    exclusions: ["tmp/**"]
  });
  expect(
    parseFffScopes("grep", { path: " src ", pattern: "ignored/** !text" }, "/work", false)
  ).toEqual({
    expressions: [{ source: "path", value: "src", directoryOnly: true, validatePath: true }],
    exclusions: []
  });
});

it("takes multi-search scopes only from constraints and preserves rooted and recursive filters", () => {
  expect(
    parseFffScopes(
      "multi",
      { path: "ignored/", pattern: "ignored/**", constraints: "/root/** **/src/*.ts !tmp bare" },
      "/work",
      true
    )
  ).toEqual({
    expressions: [
      { source: "query", value: "/root/**", directoryOnly: false, validatePath: true },
      { source: "query", value: "**/src/*.ts", directoryOnly: false, validatePath: true }
    ],
    exclusions: ["tmp"]
  });
  expect(parseFffScopes("grep", { path: "!src", pattern: "src/**" }, "/work", true)).toEqual({
    expressions: [],
    exclusions: []
  });
});

it("retains only explicit glob prefixes, including absolute roots", () => {
  expect(globRoot("packages/web/**/*.ts")).toEqual({ prefix: "packages/web", filter: "**/*.ts" });
  expect(globRoot("/**/*.ts")).toEqual({ prefix: "/", filter: "**/*.ts" });
  expect(globRoot("**/src/*.ts")).toBeUndefined();
  expect(hasGlob("src/[ab].ts")).toBe(true);
  expect(hasGlob("src/file.ts")).toBe(false);
});

it("normalizes FFF's recursive filename filters without making them concrete", () => {
  for (const value of ["file.ts", "./file.ts", "/work/file.ts"]) {
    expect(normalizeFffPath(value, "/work")).toEqual({ value: "file.ts", directoryOnly: false });
  }

  expect(normalizeFffPath("src", "/work")).toEqual({ value: "src", directoryOnly: true });
  expect(normalizeFffPath("src/file.ts", "/work")).toEqual({
    value: "src/file.ts",
    directoryOnly: false
  });
});
