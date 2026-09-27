import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { RunThroughput } from "./throughput.ts";

beforeEach(() => vi.useFakeTimers({ toFake: ["performance", "Date"] }));
afterEach(() => vi.useRealTimers());

it("accumulates only assistant stream time, excluding gaps and wall-clock changes", () => {
  const throughput = new RunThroughput();
  vi.advanceTimersByTime(10_000);
  throughput.start();
  vi.advanceTimersByTime(1000);
  vi.setSystemTime(new Date("2000-01-01"));
  throughput.end(100);
  vi.advanceTimersByTime(20_000);
  throughput.start();
  vi.advanceTimersByTime(3000);
  throughput.end(60);
  expect(throughput.finish()).toEqual({ outputTokens: 160, durationMs: 4000 });
});

it("ignores unmatched ends, duplicate ends, and unfinished streams", () => {
  const throughput = new RunThroughput();
  throughput.end(100);
  expect(throughput.finish()).toBeUndefined();
  throughput.start();
  vi.advanceTimersByTime(500);
  throughput.end(20);
  throughput.end(20);
  throughput.start();
  vi.advanceTimersByTime(5000);
  expect(throughput.finish()).toEqual({ outputTokens: 20, durationMs: 500 });
});

it.each([0, -1, 1.5, NaN, Infinity])("excludes unusable output usage %s and its time", (tokens) => {
  const throughput = new RunThroughput();
  throughput.start();
  vi.advanceTimersByTime(2000);
  throughput.end(tokens);
  expect(throughput.finish()).toBeUndefined();
  throughput.start();
  vi.advanceTimersByTime(500);
  throughput.end(20);
  expect(throughput.finish()).toEqual({ outputTokens: 20, durationMs: 500 });
});

it("omits zero-duration responses without losing fractional milliseconds", () => {
  const clock = vi.spyOn(performance, "now");
  const throughput = new RunThroughput();

  try {
    clock.mockReturnValue(0);
    throughput.start();
    throughput.end(100);
    expect(throughput.finish()).toBeUndefined();
    throughput.start();
    clock.mockReturnValue(0.5);
    throughput.end(1);
    expect(throughput.finish()).toEqual({ outputTokens: 1, durationMs: 0.5 });
  } finally {
    clock.mockRestore();
  }
});
