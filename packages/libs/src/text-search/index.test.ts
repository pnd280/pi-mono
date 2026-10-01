import { setImmediate } from "node:timers/promises";

import { expect, it } from "vite-plus/test";

import { normalizeSearchAsync, searchText } from "./index.ts";

it("keeps caller objects, stable ranking and the original array for an empty query", async () => {
  const items = ["f_o_o b_a_r", "f_o_o b_a_r", "bar foo", "foo bar one", "foo bar two", "miss"].map(
    (normalized, id) => ({ normalized, id })
  );
  const result = await searchText(items, "FOO  bar");
  expect(result.map((item) => item.id)).toEqual([3, 4, 2, 0, 1]);
  expect(result[0]).toBe(items[3]);
  expect(await searchText(items, "\t")).toBe(items);
});

it("normalizes complete Unicode strings across whitespace and case-context chunk boundaries", async () => {
  const text = "A".repeat(65534) + "ΟΣΑ" + " ".repeat(3 * 65536) + "\u202fEND ";
  expect(await normalizeSearchAsync(text)).toBe("a".repeat(65534) + "οσα end");
});

it("stops whitespace normalization when its activation expires", async () => {
  const controller = new AbortController();
  const pending = normalizeSearchAsync("word ".repeat(100000), controller.signal);
  const outcome = pending.then(
    () => "completed",
    (error: unknown) => error
  );
  await setImmediate();
  controller.abort();
  expect(await outcome).toMatchObject({ name: "AbortError" });
});

it("can cancel while ranking one large record", async () => {
  let checkpoints = 0;
  const result = await searchText(
    [{ id: "stale", normalized: "x".repeat(800000) + "n_e_e_d_l_e" }],
    "needle",
    () => ++checkpoints < 3
  );
  expect(result.map((item) => item.id)).toEqual([]);
});

it("can cancel between repeated literal or fuzzy term scans within one short record", async () => {
  for (const [normalized, query] of [
    ["a".repeat(40000) + "z", "z z"],
    ["a" + "_".repeat(40000) + "z", "az az"]
  ] as const) {
    let checkpoints = 0;
    expect(await searchText([{ normalized }], query, () => ++checkpoints < 3)).toEqual([]);
  }
});

it("can cancel while preparing a literal scan for a query larger than a chunk", async () => {
  let checkpoints = 0;
  expect(
    await searchText(
      [{ normalized: "ab".repeat(60000) + "c" }],
      "ab".repeat(40000) + "c",
      () => ++checkpoints < 3
    )
  ).toEqual([]);
});

it("abandons stale work both before starting and at cooperative checkpoints", async () => {
  const items = [{ normalized: "needle" }];
  expect(await searchText(items, "needle", () => false)).toEqual([]);
  let current = true;
  const result = searchText(items, "needle", () => current);
  await setImmediate();
  current = false;
  expect(await result).toEqual([]);
});
