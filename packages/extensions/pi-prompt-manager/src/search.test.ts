import { setImmediate } from "node:timers/promises";

import { searchText } from "@pi-mono/libs/text-search";
import { expect, it } from "vite-plus/test";

import { initialHistoryQuery, prepareItems } from "./search.ts";
import { collection, entry } from "./test-fixture.ts";

it("ranks phrase, all literal terms, then summed per-term fuzzy scores in stable order", async () => {
  const items = await prepareItems(
    collection([
      entry("food xx bar"),
      entry("bar ... foo"),
      entry("foo bar first"),
      entry("foo bar second"),
      entry("f_o_o b_a_r"),
      entry("unrelated")
    ])
  );
  const result = await searchText(items, "FOO  bar");
  expect(result.map((item) => item.occurrence.source.text)).toEqual([
    "foo bar first",
    "foo bar second",
    "food xx bar",
    "bar ... foo",
    "f_o_o b_a_r"
  ]);
  expect(await searchText(items, "")).toBe(items);
});

it("searches complete sanitized text while preserving exact copy/restoration source and draft numbering", async () => {
  const source = "\x1b]52;c;hidden\x07" + "row ".repeat(1000) + "needle";
  const items = await prepareItems(
    collection([entry("other"), entry(source, { recordedAt: "invalid" })])
  );
  expect((await searchText(items, "needle"))[0]?.occurrence.number).toBe(2);
  expect(await searchText(items, "hidden")).toEqual([]);
  expect(items[1]?.occurrence.source.text).toBe(source);
  expect(items[1]?.time).toBeUndefined();
});

it("stops preparing a collection when its view expires", async () => {
  const controller = new AbortController();
  const snapshot = collection(Array.from({ length: 8 }, () => entry("large ".repeat(50000))));
  const pending = prepareItems(snapshot, controller.signal);
  const cancelled = expect(pending.then(() => "completed")).rejects.toMatchObject({
    name: "AbortError"
  });
  await setImmediate();
  controller.abort();
  await cancelled;
});

it("seeds History only from short single-line nonblank original editor text", () => {
  expect(initialHistoryQuery("  query  ")).toBe("query");
  expect(initialHistoryQuery("😀".repeat(99))).toBe("😀".repeat(99));

  for (const text of ["😀".repeat(100), "a\nb", "a\rb", "a\u2028b", "a\u2029b", " \t "])
    expect(initialHistoryQuery(text)).toBe("");
});
