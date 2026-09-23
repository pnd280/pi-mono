import type { SelectedSource } from "@pi-mono/utils/source-selection";
import { expect, it } from "vite-plus/test";

import { selectionPreview } from "./selection.ts";

function selected(lines: string[], partial = false): SelectedSource {
  return { partial, lines: lines.map((text, index) => ({ index, before: "", text })) };
}

it("preserves selected source and labels partial or empty previews", () => {
  expect(selectionPreview(selected(["\t😀\r", ""], true))).toBe(
    "Selected source preview (partial):\n\t😀\r\n"
  );
  expect(selectionPreview(selected([]))).toContain("no text in this read window");
  expect(selectionPreview(selected([""]))).toContain("no text in this read window");
});

it("keeps five lines intact, then keeps the outer two pairs with an omission marker", () => {
  expect(selectionPreview(selected(["one", "two", "three", "four", "five"]))).toBe(
    "Selected source preview:\none\ntwo\nthree\nfour\nfive"
  );
  const lines = ["one", "two", "three", "four", "five", "six"];
  expect(selectionPreview(selected(lines))).toBe(
    "Selected source preview (truncated):\none\ntwo\n…\nfive\nsix"
  );
  expect(selectionPreview(selected(lines, true))).toContain("(partial, truncated)");
});

it("counts Unicode code points rather than UTF-16 units and retains both ends", () => {
  const full = "😀".repeat(500);
  expect(selectionPreview(selected([full]))).toBe(`Selected source preview:\n${full}`);
  expect(selectionPreview(selected(["😀".repeat(250) + "DROP" + "界".repeat(249)]))).toBe(
    "Selected source preview (truncated):\n" + "😀".repeat(250) + "…" + "界".repeat(249)
  );
});
