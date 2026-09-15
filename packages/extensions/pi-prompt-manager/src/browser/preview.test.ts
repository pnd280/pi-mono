import { expect, it } from "vite-plus/test";

import { relativeTime } from "./preview.ts";

const now = Date.UTC(2026, 0, 1);
const day = 86400;

it("formats compact ages like Pi's session picker at unit boundaries", () => {
  for (const [seconds, expected] of [
    [5 * 3600, "5h"],
    [0, "now"],
    [59.999, "now"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [day - 1, "23h"],
    [day, "1d"],
    [7 * day - 1, "6d"],
    [7 * day, "1w"],
    [30 * day - 1, "4w"],
    [30 * day, "1mo"],
    [365 * day - 1, "12mo"],
    [365 * day, "1y"]
  ] as const) {
    expect(relativeTime(now - seconds * 1000, now)).toBe(expected);
  }
});

it("distinguishes future and unknown timestamps without suggesting a past age", () => {
  expect(relativeTime(now + 5 * 3600 * 1000, now)).toBe("+5h");
  expect(relativeTime(now + 60000, now)).toBe("+1m");
  expect(relativeTime(now + 59999, now)).toBe("now");
  expect(relativeTime(undefined, now)).toBe("Unknown time");
});
