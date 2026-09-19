import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AgentTimer } from "./timer.ts";

beforeEach(() =>
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] })
);
afterEach(() => vi.useRealTimers());

it("updates immediately and each second without restarting for continuations", () => {
  const setText = vi.fn();
  const timer = new AgentTimer(setText);
  expect(vi.getTimerCount()).toBe(0);
  timer.start(true);
  expect(setText).toHaveBeenLastCalledWith("0s");
  vi.advanceTimersByTime(2000);
  expect(setText).toHaveBeenLastCalledWith("2s");
  timer.start(true);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(1250);
  expect(timer.finish()).toEqual({ durationMs: 3250 });
  expect(setText).toHaveBeenLastCalledWith();
  expect(vi.getTimerCount()).toBe(0);
  const updates = setText.mock.calls.length;
  vi.advanceTimersByTime(5000);
  expect(setText).toHaveBeenCalledTimes(updates);
  expect(timer.finish()).toBeUndefined();
  timer.start(true);
  vi.advanceTimersByTime(500);
  expect(timer.finish()).toEqual({ durationMs: 500 });
});

it("measures with a monotonic clock even when the system clock changes", () => {
  const timer = new AgentTimer(vi.fn());
  timer.start(true);
  vi.advanceTimersByTime(1000);
  vi.setSystemTime(new Date("2000-01-01"));
  vi.advanceTimersByTime(500);
  expect(timer.finish()).toEqual({ durationMs: 1500 });
});

it("records non-TUI runs without periodic UI work", () => {
  const setText = vi.fn();
  const timer = new AgentTimer(setText);
  timer.start(false);
  vi.advanceTimersByTime(61234);
  expect(vi.getTimerCount()).toBe(0);
  expect(setText).not.toHaveBeenCalled();
  expect(timer.finish()).toEqual({ durationMs: 61234 });
});

it("discards unfinished runs on reset and cancels all future updates", () => {
  const setText = vi.fn();
  const timer = new AgentTimer(setText);
  timer.start(true);
  vi.advanceTimersByTime(2000);
  timer.reset();
  timer.reset();
  expect(timer.finish()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  const updates = setText.mock.calls.length;
  vi.advanceTimersByTime(5000);
  expect(setText).toHaveBeenCalledTimes(updates);
  timer.start(true);
  expect(setText).toHaveBeenLastCalledWith("0s");
  expect(timer.finish()).toEqual({ durationMs: 0 });
});
