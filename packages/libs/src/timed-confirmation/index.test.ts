import { afterEach, expect, it, vi } from "vite-plus/test";

import { TimedConfirmation } from "./index.ts";

afterEach(() => vi.useRealTimers());

it("supports undefined as a target without confusing it with unarmed state", () => {
  const confirmation = new TimedConfirmation<undefined>({
    durationMs: 100,
    now: () => 0,
    expired() {}
  });

  try {
    expect(confirmation.confirm(undefined)).toBe(false);
    expect(confirmation.confirm(undefined)).toBe(true);
  } finally {
    confirmation.dispose();
  }
});

it("confirms only the identical target within the deadline and consumes that confirmation", async () => {
  vi.useFakeTimers();
  const expired = vi.fn();
  const confirmation = new TimedConfirmation<object>({ durationMs: 100, now: Date.now, expired });
  const a = { id: 1 },
    b = { id: 1 };
  expect(confirmation.confirm(a)).toBe(false);
  expect(confirmation.confirm(b)).toBe(false);
  expect(confirmation.confirm(b)).toBe(true);
  expect(confirmation.armed).toBeUndefined();
  expect(confirmation.confirm(a)).toBe(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(expired).toHaveBeenCalledTimes(1);
  expect(confirmation.confirm(a)).toBe(false);
  confirmation.dispose();
});

it("checks elapsed time even before the timer fires and cancels without executing an action", async () => {
  vi.useFakeTimers();
  let now = 0;
  const expired = vi.fn();
  const confirmation = new TimedConfirmation({ durationMs: 100, now: () => now, expired });
  expect(confirmation.confirm("a")).toBe(false);
  now = 100;
  expect(confirmation.confirm("a")).toBe(false);
  confirmation.cancel();
  expect(confirmation.armed).toBeUndefined();
  confirmation.dispose();
  expect(confirmation.confirm("a")).toBe(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(expired).not.toHaveBeenCalled();
});
