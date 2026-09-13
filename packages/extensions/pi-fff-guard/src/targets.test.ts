import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { extractScope, resolvePath, type SearchInput, type SearchKind } from "./targets.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
});
afterEach(async () => {
  await rm(directory.root, { recursive: true, force: true });
});

const roots = async (kind: SearchKind, input: SearchInput) => {
  const scope = await extractScope(kind, input, directory.root);
  expect(scope.missingPath, JSON.stringify({ kind, input })).toBeUndefined();

  return scope.targets.map((target) => path.relative(directory.root, target.absolute));
};

describe("explicit search scopes", () => {
  it("resolves explicit paths, rooted globs, finite alternatives, and filename constraints", async () => {
    expect(await roots("grep", { path: "node_modules/dependency/package.json" })).toEqual([
      "node_modules/dependency/package.json"
    ]);
    expect(await roots("grep", { path: "./node_modules/" })).toEqual(["node_modules"]);
    expect(await roots("grep", { path: path.join(directory.root, ".tmp/**/*.html") })).toEqual([
      ".tmp"
    ]);
    expect(await roots("grep", { path: "{src,node_modules}/**" })).toEqual(["src", "node_modules"]);
    expect(
      await roots("grep", { path: "../" + path.basename(directory.root) + "/node_modules" })
    ).toEqual(["node_modules"]);
    expect(resolvePath("~/dependency", directory.root)).toBe(path.join(homedir(), "dependency"));
    expect(await roots("find", { pattern: "node_modules/** package" })).toEqual(["node_modules"]);
  });

  it("accepts fuzzy queries, search filters, and viable glob alternatives with the correct targets", async () => {
    const cases: Array<[SearchKind, SearchInput, string[]]> = [
      ["find", { pattern: "node_modules" }, []],
      ["find", { pattern: "package.json" }, []],
      ["find", { pattern: "missing src/partial" }, []],
      ["find", { pattern: "**/node_modules/**" }, []],
      ["find", { cursor: "fff_c1" }, []],
      ["grep", { pattern: "node_modules/", exclude: "node_modules/", cursor: "fff_c1" }, []],
      ["grep", { pattern: "./missing.ts", exclude: "missing/" }, []],
      ["grep", { path: "missing.ts" }, []],
      ["grep", { path: "./missing.ts" }, []],
      ["grep", { path: path.join(directory.root, "missing.ts") }, []],
      ["grep", { path: " src/ " }, ["src"]],
      ["grep", { path: " " }, []],
      ["grep", { path: "." }, [""]],
      ["grep", { path: "*.ts" }, []],
      ["grep", { path: "src/**/*.missing" }, ["src"]],
      ["grep", { path: "{src,missing}/**" }, ["src"]],
      ["grep", { path: "{missing,**}/file.ts" }, []],
      ["grep", { path: "**/missing/**" }, []],
      [
        "multi",
        { patterns: ["node_modules/", "missing/"], constraints: "*.ts !node_modules/ !missing/" },
        []
      ]
    ];

    for (const [kind, input, expectedTargets] of cases) {
      expect(await roots(kind, input), JSON.stringify({ kind, input })).toEqual(expectedTargets);
    }
  });

  it("reports missing concrete paths and glob roots without requiring glob matches", async () => {
    const missingPaths = [
      "missing",
      "missing/",
      "./src/missing.ts",
      "../node_modules/@earendil-works/pi-coding-agent",
      path.join(directory.root, "missing"),
      `~/${path.relative(homedir(), directory.root)}/missing`,
      "node_modules/missing",
      "src/main.ts/child",
      "node_modules/missing/**/*.ts",
      "{missing,also-missing}/**"
    ];

    for (const missingPath of missingPaths) {
      const scope = await extractScope("grep", { path: missingPath }, directory.root);
      expect(scope.missingPath, missingPath).toBe(missingPath);
      expect(scope.targets, missingPath).toEqual([]);
    }

    expect(
      (await extractScope("find", { pattern: "./missing.ts" }, directory.root)).missingPath
    ).toBe("./missing.ts");
    expect(
      (await extractScope("multi", { constraints: "src/ missing/" }, directory.root)).missingPath
    ).toBe("missing/");
  });

  it("removes wholly excluded targets, but keeps partially excluded directories", async () => {
    expect(
      await roots("grep", { path: "{src,node_modules}/**", exclude: "node_modules/,*.min.js" })
    ).toEqual(["src"]);
    expect(
      await roots("grep", {
        path: "node_modules/dependency/package.json",
        exclude: ["!*.json", "src/"]
      })
    ).toEqual([]);
    expect(await roots("grep", { path: ".tmp/**", exclude: ".tmp/**" })).toEqual([]);
    expect(await roots("grep", { path: ".tmp/**", exclude: ". **" })).toEqual([".tmp"]);
    expect(
      await roots("grep", { path: "node_modules/", exclude: "node_modules/dependency/" })
    ).toEqual(["node_modules"]);
    expect(
      await roots("multi", { patterns: ["src/"], constraints: "{src,node_modules}/** !src/" })
    ).toEqual(["node_modules"]);
  });

  it("accounts for hidden-file exclusions and intersecting positive constraints", async () => {
    expect(await roots("grep", { path: ".tmp/page.html", exclude: "**/*.html" })).toEqual([]);
    expect(await roots("grep", { path: ".tmp/**/*.html", exclude: "*.html" })).toEqual([]);
    expect(await roots("find", { path: ".tmp/page.html", pattern: "*.ts" })).toEqual([]);
    expect(await roots("multi", { constraints: "src/ node_modules/" })).toEqual([]);
    expect(await roots("multi", { constraints: "node_modules/ node_modules/dependency/" })).toEqual(
      ["node_modules/dependency"]
    );
    expect(
      await roots("grep", { path: ".tmp/page.html", exclude: directory.root + "/.tmp/**/*.html" })
    ).toEqual([]);
  });

  it("preserves explicit literal paths containing spaces, commas, and glob characters", async () => {
    const name = "node_modules/a, b/[file].ts";
    await directory.write(name);
    expect(await roots("grep", { path: name })).toEqual([name]);
    expect(await roots("find", { pattern: name })).toEqual([name]);
  });
});
