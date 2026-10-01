import { expect, it } from "vite-plus/test";

import { joinOutputText, outputOmission, sliceOutputText, splitOutputText } from "./output-text.ts";

it("segments only generated notices without losing source or Unicode offsets", () => {
  const output = joinOutputText(["😀 [omitted]", outputOmission("[omitted]"), "tail"], "\n");
  const parts = splitOutputText(output);
  expect(parts).toEqual([
    { kind: "output", text: "😀 [omitted]\n" },
    { kind: "omission", text: "[omitted]" },
    { kind: "output", text: "\ntail" }
  ]);
  expect(splitOutputText({ text: "" })).toEqual([]);
  expect(splitOutputText(outputOmission("all"))).toEqual([{ kind: "omission", text: "all" }]);
  const adjacent = splitOutputText(joinOutputText([outputOmission("a"), outputOmission("b")]));
  expect(adjacent.map(({ text }) => text).join("")).toBe("ab");
  expect(adjacent.every(({ kind }) => kind === "omission")).toBe(true);
});

it("rejects invalid omission offsets rather than duplicating or dropping output", () => {
  for (const omissions of [
    [{ start: -1, end: 1 }],
    [{ start: 0.5, end: 1 }],
    [{ start: 2, end: 1 }],
    [{ start: 0, end: 4 }],
    [
      { start: 0, end: 2 },
      { start: 1, end: 3 }
    ]
  ]) {
    const invalid = { text: "abc", omissions };
    expect(() => splitOutputText(invalid)).toThrow(RangeError);
    expect(() => joinOutputText(["prefix", invalid])).toThrow(RangeError);
    expect(() => sliceOutputText(invalid, 0)).toThrow(RangeError);
  }
});

it("tracks only inserted notices through UTF-16 joins and partially overlapping slices", () => {
  const output = joinOutputText(["😀 [omitted]", outputOmission("[omitted]"), "tail"], "\n");
  expect(output.omissions).toEqual([{ start: 13, end: 22 }]);
  const sliced = sliceOutputText(output, 15, 24);
  expect(sliced.text).toBe("mitted]\nt");
  expect(sliced.omissions).toEqual([{ start: 0, end: 7 }]);
  expect(sliceOutputText(output, 0, 13).omissions).toEqual([]);
  expect(joinOutputText(["界", sliced], ":").omissions).toEqual([{ start: 2, end: 9 }]);
  expect(sliceOutputText(output, 22, 22)).toEqual({ text: "", omissions: [] });
  expect(() => sliceOutputText(output, -1)).toThrow(RangeError);
});
