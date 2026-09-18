import { expect, it } from "vite-plus/test";

import { piFffAdapter } from "./index.ts";
import { fffToolInfo } from "./test-fixture.ts";
const summaryContext = { args: {}, outcome: "success" as const, operation: undefined };

it("separates FFF summaries from pagination diagnostics", () => {
  const find = piFffAdapter(fffToolInfo("fffind"))!;
  const grep = piFffAdapter(fffToolInfo("ffgrep"))!;
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
  expect(find.notices?.(complete, true)).toEqual([]);
  expect(find.summary?.(complete, summaryContext)).toEqual({
    text: "1 matching file · 1 indexed file"
  });
  expect(grep.summary?.(paged, summaryContext)).toEqual({
    text: "1 match collected · 5 indexed files"
  });

  for (const hasMore of [false, true]) {
    const pagedFind = { ...complete, details: { ...complete.details, hasMore } };
    expect(find.notices?.(pagedFind, false)).toEqual([]);
    expect(find.notices?.(pagedFind, true)).toEqual([]);
    expect(find.summary?.(pagedFind, summaryContext)).toEqual({
      text: "1 matching file · 1 indexed file"
    });
  }
});

it("requires nonnegative integer counts and a successful outcome for summaries", () => {
  const adapter = piFffAdapter(fffToolInfo("ffgrep"))!;
  for (const details of [
    undefined,
    {},
    { totalMatched: 1 },
    { totalMatched: -1, totalFiles: 2 },
    { totalMatched: 0.5, totalFiles: 2 }
  ])
    expect(adapter.summary?.({ content: [], details }, summaryContext)).toBeUndefined();
  const empty = { content: [], details: { totalMatched: 0, totalFiles: 328 } };
  expect(adapter.summary?.(empty, summaryContext)?.text).toBe(
    "0 matches collected · 328 indexed files"
  );
  expect(adapter.summary?.(empty, { ...summaryContext, outcome: "failure" })).toBeUndefined();
});

it.each(["fffind", "ffgrep", "fff-multi-grep"])(
  "defaults compact %s searches to . while preserving explicit scopes",
  (name) => {
    const multi = name === "fff-multi-grep";
    const adapter = piFffAdapter(fffToolInfo(name, multi))!;

    for (const scope of [undefined, "", ".", "src/**"]) {
      const args = multi
        ? { patterns: ["token"], constraints: scope }
        : { pattern: "token", path: scope };
      expect(adapter.exploration?.(args)).toEqual([
        {
          label: "Search",
          scope: { kind: "filter", value: scope || "." },
          parts: [{ kind: "pattern", text: "token" }]
        }
      ]);
    }
  }
);

it("requires official ownership and supplied contracts without enabling disabled tools", () => {
  expect(piFffAdapter(undefined)).toBeUndefined();
  expect(piFffAdapter({ ...fffToolInfo("ffgrep"), parameters: {} })).toBeUndefined();
  const grep = piFffAdapter(fffToolInfo("ffgrep"))!;
  const args = { pattern: "token", path: "src/**", exclude: ["*.min.js"], cursor: "c1", limit: 20 };
  expect(grep.exploration?.(args)).toEqual([
    {
      label: "Search",
      scope: { kind: "filter", value: "src/**" },
      parts: [{ kind: "pattern", text: "token" }]
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
  const find = piFffAdapter(fffToolInfo("fffind"))!;
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
    piFffAdapter(fffToolInfo("fff-multi-grep", true))?.exploration?.({
      patterns: ["a", "b"],
      constraints: "src/"
    })
  ).toEqual([
    {
      label: "Search",
      scope: { kind: "filter", value: "src/" },
      parts: [{ kind: "pattern", text: "a, b" }]
    }
  ]);
});
