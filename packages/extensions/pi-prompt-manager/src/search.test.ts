import { expect, it } from "vite-plus/test";

import { initialHistoryQuery, normalizeSearch, prepareItems, searchItems } from "./search.ts";
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
  const result = await searchItems(items, "FOO  bar");
  expect(result.map((item) => item.occurrence.source.text)).toEqual([
    "foo bar first",
    "foo bar second",
    "food xx bar",
    "bar ... foo",
    "f_o_o b_a_r"
  ]);
  expect(await searchItems(items, "")).toBe(items);
  expect(normalizeSearch("CAFÉ\t A\nB")).toBe("café a b");
  expect(normalizeSearch("e\u0301")).not.toBe(normalizeSearch("é"));
});

it("searches complete sanitized text while preserving exact copy/restoration source and draft numbering", async () => {
  const source = "\x1b]52;c;hidden\x07" + "row ".repeat(1000) + "needle";
  const items = await prepareItems(
    collection([entry("other"), entry(source, { recordedAt: "invalid" })])
  );
  expect((await searchItems(items, "needle"))[0]?.occurrence.number).toBe(2);
  expect(await searchItems(items, "hidden")).toEqual([]);
  expect(items[1]?.occurrence.source.text).toBe(source);
  expect(items[1]?.time).toBeUndefined();
});

it("preserves whitespace and Unicode lowercase semantics across large normalization chunks", async () => {
  const prefix = "A".repeat(65534);
  const source = prefix + "ΟΣΑ" + " ".repeat(3 * 65536) + "\u202fEND ";
  const items = await prepareItems(collection([entry(source)]));
  expect(items[0]?.normalized).toBe("a".repeat(65534) + "οσα end");
});

it("seeds History only from short single-line nonblank original editor text", () => {
  expect(initialHistoryQuery("  query  ")).toBe("query");
  expect(initialHistoryQuery("😀".repeat(99))).toBe("😀".repeat(99));

  for (const text of ["😀".repeat(100), "a\nb", "a\rb", "a\u2028b", "a\u2029b", " \t "])
    expect(initialHistoryQuery(text)).toBe("");
});
