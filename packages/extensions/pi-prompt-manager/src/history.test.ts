import { expect, it } from "vite-plus/test";

import { captureText, historyRows } from "./history.ts";
import { limits } from "./model.ts";
import { collection, entry } from "./test-fixture.ts";

it("displays only the first occurrence of each trimmed prompt without changing source", () => {
  const current = collection([entry(" A "), entry("B"), entry("A"), entry("a")], "history");
  expect(historyRows(current.entries).map((item) => item.source.text)).toEqual([" A ", "B", "a"]);
  expect(current.entries).toHaveLength(4);
});

it("trims captures and counts UTF-8 bytes for admission", () => {
  expect(captureText(" \n\t ")).toBeUndefined();
  expect(captureText(" \ntext\t ")).toBe("text");
  expect(captureText("é".repeat(limits.historyText / 2))).toBeDefined();
  expect(captureText("é".repeat(limits.historyText / 2 + 1))).toBeUndefined();
});
