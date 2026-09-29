import { expect, it } from "vite-plus/test";

import {
  alternatives,
  filenameQueryTokens,
  globRoot,
  hasGlob,
  normalizeFffPath
} from "./search-scopes.ts";

it("expands only finite brace alternatives and bounds combinatorial inputs", () => {
  expect(alternatives("{src,lib}/{a,b}/**")).toEqual([
    "src/a/**",
    "src/b/**",
    "lib/a/**",
    "lib/b/**"
  ]);
  expect(alternatives("src/{1..4}/**")).toEqual(["src/{1..4}/**"]);
  expect(() => alternatives("{a,b}".repeat(7))).toThrow("too many");
});

it("preserves only existing explicit filename-query paths, not bare fuzzy words", () => {
  expect(filenameQueryTokens("pkg space/file.ts", true)).toEqual(["pkg space/file.ts"]);
  expect(filenameQueryTokens("pkg/** profile", false)).toEqual(["pkg/**", "profile"]);
  expect(filenameQueryTokens("two words", true)).toEqual(["two", "words"]);
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
