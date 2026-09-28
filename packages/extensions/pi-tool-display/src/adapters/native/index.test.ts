import { expect, it } from "vite-plus/test";

import type { ChangeFact, SummaryItemContext } from "../../contracts.ts";
import { nativeAdapter } from "./index.ts";

const context = (change?: ChangeFact["change"]): SummaryItemContext => ({
  result: undefined,
  change: change && { kind: "change", availability: "available", change },
  cwd: "/work"
});

const items = (name: string, args: unknown, change?: ChangeFact["change"]) =>
  nativeAdapter(name)?.summaryItems?.(args, context(change));

it("identifies file summary items by resolved path across read, edit, and write", () => {
  const read = items("read", { path: "src/a.ts" });
  expect(read).toMatchObject([{ category: "read" }]);
  expect(read?.[0]?.identity).toBeTypeOf("string");
  const file = { identity: read![0]!.identity };
  expect(items("read", { file_path: "./src/../src/a.ts" })).toEqual([
    { category: "read", ...file }
  ]);
  expect(items("edit", { path: "/work/src/a.ts", edits: [] })).toEqual([
    { category: "edit", ...file }
  ]);
  expect(items("write", { path: "src/a.ts" }, "creation")).toEqual([
    { category: "create", ...file }
  ]);
  expect(items("write", { path: "src/a.ts" }, "modification")).toEqual([
    { category: "edit", ...file }
  ]);
  expect(items("write", { path: "src/a.ts" })).toEqual([{ category: "edit", ...file }]);
  const other = items("read", { path: "src/b.ts" });
  expect(other).toMatchObject([{ category: "read" }]);
  expect(other?.[0]?.identity).toBeTypeOf("string");
  expect(other).not.toEqual(read);
});

it("counts every command and search call and identifies listings by directory", () => {
  // Undefined uses the family fallback, which counts each call.
  expect(items("bash", { command: "npm test" })).toBeUndefined();
  expect(items("grep", { pattern: "run", path: "src" })).toBeUndefined();
  const directory = items("ls", {});
  expect(directory).toMatchObject([{ category: "list" }]);
  expect(directory?.[0]?.identity).toBeTypeOf("string");
  expect(items("ls", { path: "./" })).toEqual(directory);
  const other = items("ls", { path: "src" });
  expect(other).toMatchObject([{ category: "list" }]);
  expect(other?.[0]?.identity).toBeTypeOf("string");
  expect(other).not.toEqual(directory);
});

it("falls back for partial or invalid arguments", () => {
  for (const [name, args] of [
    ["read", {}],
    ["edit", { path: "" }],
    ["write", undefined],
    ["ls", { path: 1 }]
  ] as const)
    expect(items(name, args)).toBeUndefined();
});
