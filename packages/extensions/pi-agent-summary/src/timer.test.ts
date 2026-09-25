import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AgentTimer } from "./timer.ts";

beforeEach(() =>
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] })
);
afterEach(() => vi.useRealTimers());

it("measures with a monotonic clock even when the system clock changes", () => {
  const timer = new AgentTimer(vi.fn());
  timer.start(true);
  vi.advanceTimersByTime(1000);
  vi.setSystemTime(new Date("2000-01-01"));
  vi.advanceTimersByTime(500);
  expect(timer.finish()).toEqual({ durationMs: 1500 });
});
