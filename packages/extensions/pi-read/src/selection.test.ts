import type { SelectedSource } from "@pi-mono/utils/source-selection";
import { expect, it } from "vite-plus/test";

import { selectionPreview } from "./selection.ts";

function selected(lines: string[], partial = false): SelectedSource {
  return { partial, lines: lines.map((text, index) => ({ index, before: "", text })) };
}

function previewLines(source: SelectedSource): string[] {
  return selectionPreview(source).split("\n").slice(1);
}

it("preserves selected source and directs empty selections to the read window", () => {
  const preview = selectionPreview(selected(["\t😀\r", ""], true));
  expect(preview).toContain("partial");
  expect(previewLines(selected(["\t😀\r", ""], true))).toEqual(["\t😀\r", ""]);

  for (const lines of [[], [""]]) {
    expect(selectionPreview(selected(lines))).toMatch(/offset.*limit/);
  }
});

it("keeps five lines intact, then keeps the outer two pairs with an omission marker", () => {
  expect(previewLines(selected(["one", "two", "three", "four", "five"]))).toEqual([
    "one",
    "two",
    "three",
    "four",
    "five"
  ]);
  const lines = ["one", "two", "three", "four", "five", "six"];
  expect(previewLines(selected(lines))).toEqual(["one", "two", "…", "five", "six"]);
  const preview = selectionPreview(selected(lines, true));
  expect(preview).toContain("partial");
  expect(preview).toContain("truncated");
});

it("counts Unicode code points rather than UTF-16 units and retains both ends", () => {
  const full = "😀".repeat(500);
  expect(previewLines(selected([full]))).toEqual([full]);
  const clipped = selected(["😀".repeat(250) + "DROP" + "界".repeat(249)]);
  expect(previewLines(clipped)).toEqual(["😀".repeat(250) + "…" + "界".repeat(249)]);
  expect(selectionPreview(clipped)).toContain("truncated");
});
