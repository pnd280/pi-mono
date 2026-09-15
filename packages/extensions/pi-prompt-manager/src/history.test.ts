import { expect, it } from "vite-plus/test";

import { captureText, historyRows, retainHistory } from "./history.ts";
import { limits } from "./model.ts";
import { encode, snapshot } from "./storage/codec.ts";
import { collection, entry } from "./test-fixture.ts";

it("stores A-B-A, suppresses only consecutive equality, and displays first occurrences", () => {
  let document = collection().document;

  for (const text of ["A", "B", "A", " A "])
    document = retainHistory(document, entry(captureText(text)!), 250) ?? document;
  expect(document.entries.map((item) => item.text)).toEqual(["A", "B", "A"]);
  expect(
    historyRows(snapshot("history", document, 0).entries).map((item) => item.source.text)
  ).toEqual(["A", "B"]);
  expect(retainHistory(document, entry("a"), 2)?.entries.map((item) => item.text)).toEqual([
    "a",
    "A"
  ]);
});

it("counts UTF-8 and entire encoded JSON, retaining a prefix instead of skipping entries", () => {
  expect(captureText(" \n\t ")).toBeUndefined();
  expect(captureText("é".repeat(limits.historyText / 2))).toBeDefined();
  expect(captureText("é".repeat(limits.historyText / 2 + 1))).toBeUndefined();
  const document = collection([
    entry("newer", { largeMetadata: "x".repeat(limits.historyFile) }),
    entry("older")
  ]).document;
  const result = retainHistory(document, entry("incoming"), 250)!;
  expect(result.entries).toHaveLength(1);
  expect(Buffer.byteLength(encode(result))).toBeLessThan(limits.historyFile);
});
