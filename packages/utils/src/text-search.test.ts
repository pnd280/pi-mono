import { fuzzyMatch } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { normalizeSearch, prepareSearchQuery, rankText } from "./text-search.ts";

function rank(text: string, query: ReturnType<typeof prepareSearchQuery>) {
  const steps = rankText(text, query);
  let next = steps.next();
  while (!next.done) next = steps.next();

  return next.value;
}

it("normalizes whitespace and case without Unicode canonicalization", () => {
  expect(normalizeSearch(" CAFÉ\t A\nB ")).toBe("café a b");
  expect(normalizeSearch("e\u0301")).not.toBe(normalizeSearch("é"));
  expect(prepareSearchQuery(" FOO  bar ")).toEqual({ phrase: "foo bar", terms: ["foo", "bar"] });
});

it("distinguishes phrase, all-term and fuzzy matches and rejects missing terms", () => {
  const query = prepareSearchQuery("FOO bar");
  expect(rank("foo bar first", query)).toEqual({ category: 0, score: 0 });
  expect(rank("bar ... food", query)).toEqual({ category: 1, score: 0 });
  expect(rank("f_o_o b_a_r", query)).toMatchObject({ category: 2 });
  expect(rank("foo alone", query)).toBeUndefined();
  expect(rank("anything", prepareSearchQuery(""))).toEqual({ category: 0, score: 0 });
});

it("retains literal and fuzzy matches across scan boundaries, including long queries", () => {
  const prefix = "x".repeat(65535);
  expect(rank(prefix + "foo bar", prepareSearchQuery("foo bar"))).toEqual({
    category: 0,
    score: 0
  });
  expect(rank(prefix + "foo ... bar", prepareSearchQuery("bar foo"))).toEqual({
    category: 1,
    score: 0
  });
  const long = "ab".repeat(40000) + "c";
  expect(rank("ab".repeat(10000) + long, prepareSearchQuery(long))).toEqual({
    category: 0,
    score: 0
  });
  expect(rank("ab".repeat(50000), prepareSearchQuery(long))).toBeUndefined();
});

it("yields between repeated short scans so callers can cancel expensive term searches", () => {
  for (const [text, query, category] of [
    ["a".repeat(40000) + "z", "z z", 1],
    ["a" + "_".repeat(40000) + "z", "az az", 2]
  ] as const) {
    const steps = rankText(text, prepareSearchQuery(query));
    let next = steps.next();
    expect(next).toEqual({ done: false, value: undefined });
    while (!next.done) next = steps.next();
    expect(next.value?.category).toBe(category);
  }
});

it("matches Pi's fuzzy scores, gaps, boundaries, Unicode, and letter/digit fallback", () => {
  const samples = [
    ["f_o_o b_a_r", "foo bar"],
    ["foo\tbar", "fb"],
    ["é_σ_😀", "éσ😀"],
    ["12abc", "abc12"],
    ["abc12", "12abc"],
    ["unrelated", "abc12"],
    ["x".repeat(65535) + "f_oo" + "x".repeat(65535) + "b_ar", "foo bar"]
  ] as const;

  for (const [text, query] of samples) {
    const prepared = prepareSearchQuery(query);
    const matches = prepared.terms.map((term) => fuzzyMatch(term, text));
    const expected = matches.every((match) => match.matches)
      ? { category: 2, score: matches.reduce((sum, match) => sum + match.score, 0) }
      : undefined;
    expect(rank(text, prepared)).toEqual(expected);
  }
});
