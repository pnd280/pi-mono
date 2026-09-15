import { expect, it, vi } from "vite-plus/test";

import { deferred } from "../test-fixture.ts";
import { AsyncCache } from "./index.ts";

it("deduplicates pending work, reports saturation without caching it, and retries failures", async () => {
  const pending = deferred<string>();
  const load = vi
    .fn<(key: string) => Promise<string>>()
    .mockReturnValueOnce(pending.promise)
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValue("retried");
  const cache = new AsyncCache({
    capacity: 2,
    maxPending: 1,
    load,
    onBusy: (key) => `busy:${key}`
  });
  const first = cache.load("a");
  expect(cache.load("a")).toBe(first);
  expect(await cache.load("b")).toBe("busy:b");
  expect(load).toHaveBeenCalledTimes(1);
  pending.resolve("first");
  expect(await first).toBe("first");
  await expect(cache.load("b")).rejects.toThrow("failed");
  expect(await cache.load("b")).toBe("retried");
  expect(load).toHaveBeenCalledTimes(3);
  cache.dispose();
});

it("evicts least recently used entries, including falsey cached values", async () => {
  const load = vi.fn(async (key: string) => (key === "a" ? 0 : 1));
  const onEvict = vi.fn();
  const cache = new AsyncCache({ capacity: 2, maxPending: 2, load, onEvict });
  await cache.load("a");
  await cache.load("b");
  expect(await cache.load("a")).toBe(0);
  await cache.load("c");
  expect(onEvict).toHaveBeenCalledWith("b", 1);
  expect(load).toHaveBeenCalledTimes(3);
  cache.dispose();
});

it("does not publish late results or start work after disposal", async () => {
  const pending = deferred<string>();
  const load = vi.fn(() => pending.promise);
  const onEvict = vi.fn();
  const cache = new AsyncCache({ capacity: 1, maxPending: 1, load, onEvict });
  const first = cache.load("a");
  cache.dispose();
  pending.resolve("stale");
  expect(await first).toBeUndefined();
  expect(await cache.load("b")).toBeUndefined();
  expect(load).toHaveBeenCalledTimes(1);
  expect(onEvict).not.toHaveBeenCalled();
});

it("rejects invalid capacities", () => {
  for (const capacity of [0, -1, 0.5, Infinity])
    expect(() => new AsyncCache({ capacity, maxPending: 1, load: async () => "a" })).toThrow(
      RangeError
    );
});
