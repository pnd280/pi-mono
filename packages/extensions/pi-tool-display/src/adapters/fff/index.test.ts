import { expect, it } from "vite-plus/test";

import { officialFffAdapter } from "./index.ts";
import { fffToolInfo } from "./test-fixture.ts";
it("shows compact FFF pagination while retaining expanded match counts", () => {
  const find = officialFffAdapter(fffToolInfo("fffind"))!;
  const grep = officialFffAdapter(fffToolInfo("ffgrep"))!;
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
    { kind: "info", text: "1 match reported across 1 file." }
  ]);

  for (const hasMore of [false, true]) {
    const pagedFind = { ...complete, details: { ...complete.details, hasMore } };
    expect(find.notices?.(pagedFind, false)).toEqual([]);
    expect(find.notices?.(pagedFind, true)).toEqual([
      { kind: "info", text: "1 match reported across 1 file." }
    ]);
  }
});

it("requires official ownership and supplied contracts without enabling disabled tools", () => {
  expect(officialFffAdapter(undefined)).toBeUndefined();
  expect(officialFffAdapter({ ...fffToolInfo("ffgrep"), parameters: {} })).toBeUndefined();
  const grep = officialFffAdapter(fffToolInfo("ffgrep"))!;
  const args = { pattern: "token", path: "src/**", exclude: ["*.min.js"], cursor: "c1", limit: 20 };
  expect(grep.exploration?.(args)).toEqual([
    {
      label: "Search",
      parts: [
        { kind: "pattern", text: "token" },
        { kind: "annotation", text: " in " },
        { kind: "value", text: "src/**" }
      ]
    }
  ]);
  const result = {
    content: [{ type: "text" as const, text: "limited results; cursor c2" }],
    details: { totalMatched: 20, totalFiles: 2 }
  };
  expect(grep.supports?.(args, result)).toBe(true);
  expect(grep.exploration?.(args, result)).toBeDefined();

  for (const details of [{ count: 9 }, { totalMatched: NaN, totalFiles: 2 }]) {
    expect(grep.supports?.(args, { ...result, details })).toBe(false);
    expect(grep.exploration?.(args, { ...result, details })).toBeUndefined();
  }

  expect(grep.supports?.({}, result)).toBe(false);
  const find = officialFffAdapter(fffToolInfo("fffind"))!;
  expect(
    find
      .notices?.({ ...result, details: { ...result.details, hasMore: true, pageIndex: 1 } }, true)
      .map((notice) => (notice.kind === "reference" ? notice.value : notice.text))
      .join("\n")
  ).not.toContain("Page");
  expect(
    grep
      .notices?.({ ...result, details: { ...result.details, hasMore: true, pageIndex: 1 } }, true)
      .map((notice) => (notice.kind === "reference" ? notice.value : notice.text))
      .join("\n")
  ).not.toContain("Page");
  expect(
    officialFffAdapter(fffToolInfo("fff-multi-grep", true))?.exploration?.({
      patterns: ["a", "b"],
      constraints: "src/"
    })
  ).toEqual([
    {
      label: "Search",
      parts: [
        { kind: "pattern", text: "a, b" },
        { kind: "annotation", text: " in " },
        { kind: "value", text: "src/" }
      ]
    }
  ]);
});
