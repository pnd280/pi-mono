import { selectSource, selectionSchema } from "@pi-mono/utils/source-selection";
import { describe, expect, it } from "vite-plus/test";

import { selectionPreview } from "./selection.ts";

it("slices absolute lines by code point with exclusive end columns and preserves tabs", () => {
  const span = selectionSchema.parse({ startLine: 10, startColumn: 2, endLine: 12, endColumn: 3 });
  const selected = selectSource(["a😀bc", "\tmiddle", "界xy", "context"], 10, span);
  expect(selectionPreview(selected)).toBe("Selected source preview:\n😀bc\n\tmiddle\n界x");
});

it("clips oversized columns and identifies overlapping versus absent windows", () => {
  const partial = selectSource(
    ["first", "", "last"],
    8,
    selectionSchema.parse({ startLine: 7, endLine: 9 })
  );
  expect(partial.partial).toBe(true);
  expect(selectionPreview(partial)).toBe("Selected source preview (partial):\nfirst\n");
  const clipped = selectSource(
    ["abc"],
    1,
    selectionSchema.parse({ startLine: 1, startColumn: 2, endColumn: 100 })
  );
  expect(selectionPreview(clipped)).toBe("Selected source preview:\nbc");

  for (const selection of [
    { startLine: 1, startColumn: 100 },
    { startLine: 3 },
    { startLine: 2, endLine: 3, endColumn: 1 }
  ]) {
    const source = selectSource(["abc", ""], 1, selectionSchema.parse(selection));
    expect(selectionPreview(source)).toContain("no text in this read window");
  }
});

describe("preview budgets", () => {
  it("keeps five lines intact, then keeps the outer two pairs with an omission marker", () => {
    const lines = ["one", "two", "three", "four", "five", "six"];
    const span = selectionSchema.parse({ startLine: 1, endLine: 5 });
    expect(selectionPreview(selectSource(lines, 1, span))).toBe(
      `Selected source preview:\n${lines.slice(0, 5).join("\n")}`
    );
    expect(selectionPreview(selectSource(lines, 1, { ...span, endLine: 6 }))).toBe(
      "Selected source preview (truncated):\none\ntwo\n…\nfive\nsix"
    );
    expect(selectionPreview(selectSource(lines, 1, { ...span, endLine: 7 }))).toContain(
      "(partial, truncated)"
    );
  });

  it("counts Unicode code points rather than UTF-16 units and retains both ends", () => {
    const span = selectionSchema.parse({ startLine: 1 });
    const full = "😀".repeat(500);
    expect(selectionPreview(selectSource([full], 1, span))).toBe(
      `Selected source preview:\n${full}`
    );
    const bounded = selectionPreview(
      selectSource(["😀".repeat(250) + "DROP" + "界".repeat(249)], 1, span)
    );
    const preview = bounded.split("\n")[1]!;
    expect(bounded).toContain("(truncated)");
    expect(Array.from(preview)).toHaveLength(500);
    expect(preview).toBe("😀".repeat(250) + "…" + "界".repeat(249));
  });
});
