import { expect, it } from "vite-plus/test";

import { historyRows } from "./history.ts";
import { collection, entry } from "./test-fixture.ts";

it("displays only the first occurrence of each trimmed prompt without changing source", () => {
  const current = collection([entry(" A "), entry("B"), entry("A"), entry("a")], "history");
  expect(historyRows(current.entries).map((item) => item.source.text)).toEqual([" A ", "B", "a"]);
  expect(current.entries).toHaveLength(4);
});
