import { expect, it } from "vite-plus/test";

import { selectSource, selectionLabel, selectionSchema } from "./source-selection.ts";

it("normalizes omitted coordinates without accepting unknown fields or invalid ranges", () => {
  expect(selectionSchema.parse({ startLine: 6 })).toEqual({
    startLine: 6,
    startColumn: 1,
    endLine: 6
  });
  for (const input of [
    null,
    {},
    { startLine: "1" },
    { startLine: 0 },
    { startLine: 1.5 },
    { startLine: Number.MAX_SAFE_INTEGER + 1 },
    { startLine: 1, startColumn: 0 },
    { startLine: 1, endLine: null },
    { startLine: 3, endLine: 2 },
    { startLine: 3, startColumn: 5, endColumn: 5 },
    { startLine: 3, startColumn: 5, endColumn: 4 },
    { startLine: 1, endColumn: Infinity },
    { startLine: 1, extra: true }
  ])
    expect(selectionSchema.safeParse(input).success).toBe(false);
});

it("clips code-point ranges to an absolute line window without normalizing raw source", () => {
  const span = selectionSchema.parse({ startLine: 10, startColumn: 2, endLine: 12, endColumn: 3 });
  expect(selectSource(["a😀bc", "\tmiddle", "界xy", "context"], 10, span)).toEqual({
    partial: false,
    lines: [
      { index: 0, before: "a", text: "😀bc" },
      { index: 1, before: "", text: "\tmiddle" },
      { index: 2, before: "", text: "界x" }
    ]
  });
  expect(selectSource(["middle"], 11, span)).toEqual({
    partial: true,
    lines: [{ index: 0, before: "", text: "middle" }]
  });
  expect(selectSource(["outside"], 20, span)).toEqual({ partial: true, lines: [] });
  expect(selectionLabel(span)).toBe("10:2-12:3");
  expect(selectionLabel(selectionSchema.parse({ startLine: 1 }))).toBe("1");
});

it("clips oversized columns and preserves empty selections at exclusive boundaries", () => {
  expect(
    selectSource(
      ["abc"],
      1,
      selectionSchema.parse({ startLine: 1, startColumn: 2, endColumn: 100 })
    )
  ).toEqual({ partial: false, lines: [{ index: 0, before: "a", text: "bc" }] });
  expect(
    selectSource(["abc"], 1, selectionSchema.parse({ startLine: 1, startColumn: 100 }))
  ).toEqual({ partial: false, lines: [{ index: 0, before: "abc", text: "" }] });
  expect(
    selectSource(["abc", ""], 1, selectionSchema.parse({ startLine: 2, endLine: 3, endColumn: 1 }))
  ).toEqual({ partial: true, lines: [{ index: 1, before: "", text: "" }] });
});

it("rejects invalid source-window line coordinates", () => {
  const span = selectionSchema.parse({ startLine: 1 });
  for (const firstLine of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity])
    expect(() => selectSource(["source"], firstLine, span)).toThrow(RangeError);
});
