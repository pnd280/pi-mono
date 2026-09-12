import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { officialFffAdapter, selectAdapter } from "./adapters.ts";
import { loadDisplaySettings } from "./settings.ts";
function info(name: string, multi = false): ToolInfo {
  return {
    name,
    description: "FFF",
    parameters: {
      type: "object",
      properties: { [multi ? "patterns" : "pattern"]: { type: multi ? "array" : "string" } }
    },
    sourceInfo: {
      source: "npm:@ff-labs/pi-fff@0.10.6",
      path: "/fff/src/index.ts",
      scope: "user",
      origin: "package"
    }
  };
}
it("keeps ordinary FFF counts in details and only actionable pagination in compact cards", () => {
  const find = officialFffAdapter(info("fffind"))!;
  const grep = officialFffAdapter(info("ffgrep"))!;
  const cursorNotice = '[Continue with cursor="fff_c1"]';
  const paged = {
    content: [{ type: "text" as const, text: `file.ts\n 1: export\n\n${cursorNotice}` }],
    details: { totalMatched: 1, totalFiles: 5 }
  };
  expect(grep.notices?.(paged, false)).toEqual([{ kind: "warning", text: cursorNotice }]);
  expect(grep.notices?.(paged, true)).not.toContainEqual({ kind: "warning", text: cursorNotice });
  const complete = {
    content: [{ type: "text" as const, text: "file-test.txt" }],
    details: { totalMatched: 1, totalFiles: 1, pageIndex: 0, hasMore: false }
  };
  expect(find.notices?.(complete, false)).toEqual([]);
  expect(find.notices?.(complete, true)).toEqual([
    { kind: "info", text: "1 match reported across 1 file." },
    { kind: "info", text: "Page 1." }
  ]);
  expect(
    find.notices?.({ ...complete, details: { ...complete.details, hasMore: true } }, false)
  ).toEqual([{ kind: "warning", text: "Page 1; more results available." }]);
});

it("requires official ownership and supplied contracts without enabling disabled tools", () => {
  expect(officialFffAdapter(undefined)).toBeUndefined();
  expect(officialFffAdapter({ ...info("ffgrep"), parameters: {} })).toBeUndefined();
  const grep = officialFffAdapter(info("ffgrep"))!;
  const args = { pattern: "token", path: "src/**", exclude: ["*.min.js"], cursor: "c1", limit: 20 };
  expect(grep.exploration?.(args)).toEqual([{ label: "Search", text: "token in src/**" }]);
  const result = {
    content: [{ type: "text" as const, text: "limited results; cursor c2" }],
    details: { totalMatched: 20, totalFiles: 2 }
  };
  expect(grep.exploration?.(args, result)).toBeDefined();
  expect(grep.exploration?.(args, { ...result, details: { count: 9 } })).toBeUndefined();
  const find = officialFffAdapter(info("fffind"))!;
  expect(
    find
      .notices?.({ ...result, details: { ...result.details, hasMore: true, pageIndex: 1 } }, true)
      .map((notice) => (notice.kind === "reference" ? notice.value : notice.text))
      .join("\n")
  ).toContain("Page 2; more results available");
  expect(
    grep
      .notices?.({ ...result, details: { ...result.details, hasMore: true, pageIndex: 1 } }, true)
      .map((notice) => (notice.kind === "reference" ? notice.value : notice.text))
      .join("\n")
  ).not.toContain("Page");
  expect(
    officialFffAdapter(info("fff-multi-grep", true))?.exploration?.({
      patterns: ["a", "b"],
      constraints: "src/"
    })
  ).toEqual([{ label: "Search", text: "a, b in src/" }]);
  const owner = { renderCall: () => ({ render: () => [], invalidate() {} }) };
  expect(selectAdapter(loadDisplaySettings([]), "ffgrep", owner, false, info("ffgrep"))?.id).toBe(
    "fff:grep"
  );
  expect(
    selectAdapter(
      loadDisplaySettings([
        {
          path: "settings",
          settings: { "ext.pi-tool-display": { rendererOverrides: { ffgrep: "original" } } }
        }
      ]),
      "ffgrep",
      owner,
      false,
      info("ffgrep")
    )
  ).toBeUndefined();
});
