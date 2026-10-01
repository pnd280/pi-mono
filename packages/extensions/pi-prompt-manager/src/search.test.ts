import { setImmediate } from "node:timers/promises";

import { searchText } from "@pi-mono/libs/text-search";
import { expect, it } from "vite-plus/test";

import { initialHistoryQuery, prepareItems } from "./search.ts";
import { collection, entry } from "./test-fixture.ts";

it("searches complete sanitized text while preserving exact source and draft order", async () => {
  const source = "\x1b]52;c;hidden\x07" + "row\n".repeat(127) + "ab 😀needle";
  const items = await prepareItems(
    collection([entry("other"), entry(source, { recordedAt: "invalid" })])
  );
  expect((await searchText(items, "needle"))[0]?.occurrence.source.text).toBe(source);
  expect(items.map((item) => item.occurrence.source.text)).toEqual(["other", source]);
  expect(await searchText(items, "hidden")).toEqual([]);
  expect(items[1]?.occurrence.source.text).toBe(source);
  expect(items[1]?.summary).toBe("row ".repeat(127) + "ab");
  expect(items[1]?.time).toBeUndefined();
});

it("prepares the newest distinct trimmed history sources but keeps every draft and the snapshot", async () => {
  const entries = [entry(" A "), entry("B"), entry("A"), entry("a")];
  const history = collection(entries, "history");
  expect((await prepareItems(history)).map((item) => item.occurrence.source.text)).toEqual([
    " A ",
    "B",
    "a"
  ]);
  expect(history.entries.map((item) => item.source.text)).toEqual([" A ", "B", "A", "a"]);
  expect(
    (await prepareItems(collection(entries))).map((item) => item.occurrence.source.text)
  ).toEqual([" A ", "B", "A", "a"]);
});

it("does not merge distinct history sources that sanitize to the same display", async () => {
  const items = await prepareItems(collection([entry("A"), entry("\x1b[31mA\x1b[0m")], "history"));
  expect(items.map((item) => item.occurrence.source.text)).toEqual(["A", "\x1b[31mA\x1b[0m"]);
  expect(items.map((item) => item.display)).toEqual(["A", "A"]);
});

it("yields and checks cancellation even while skipping duplicate history sources", async () => {
  const controller = new AbortController();
  const snapshot = collection(
    Array.from({ length: 5000 }, () => entry("duplicate")),
    "history"
  );
  const pending = prepareItems(snapshot, controller.signal);
  const outcome = pending.then(
    () => "completed",
    (error: unknown) => error
  );
  await setImmediate();
  controller.abort();
  await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
});

it("stops preparing a collection when its view expires", async () => {
  const controller = new AbortController();
  const snapshot = collection(Array.from({ length: 8 }, () => entry("large ".repeat(50000))));
  const pending = prepareItems(snapshot, controller.signal);
  const cancelled = expect(pending.then(() => "completed")).rejects.toMatchObject({
    name: "AbortError"
  });
  await setImmediate();
  controller.abort();
  await cancelled;
});

it("seeds History only from short single-line nonblank original editor text", () => {
  expect(initialHistoryQuery("  query  ")).toBe("query");
  expect(initialHistoryQuery("😀".repeat(99))).toBe("😀".repeat(99));

  for (const text of ["😀".repeat(100), "a\nb", "a\rb", "a\u2028b", "a\u2029b", " \t "])
    expect(initialHistoryQuery(text)).toBe("");
});
