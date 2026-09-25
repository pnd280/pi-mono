import { expect, it } from "vite-plus/test";

import { formatDuration, summarySchema } from "./summary.ts";

const summary = { durationMs: 1234, finishedAt: 1_767_270_896_000, bashCalls: 2, files: [] };

it.each([
  [0, "0s"],
  [999, "0s"],
  [59999, "59s"],
  [60000, "1m 0s"],
  [3599999, "59m 59s"],
  [3600000, "1h 0m 0s"],
  [90061000, "25h 1m 1s"]
])("formats %i milliseconds as %s", (durationMs, text) => {
  expect(formatDuration(durationMs)).toBe(text);
});

it.each([
  undefined,
  null,
  {},
  { ...summary, durationMs: "1000" },
  { ...summary, durationMs: -1 },
  { ...summary, durationMs: Infinity },
  { ...summary, durationMs: 1.5 },
  { durationMs: 1000, bashCalls: 1, files: [] },
  { ...summary, bashCalls: -1 },
  {
    ...summary,
    files: [{ path: "file", status: "available", added: -1, removed: 0 }]
  },
  { ...summary, files: [{ path: "file", status: "unavailable" }] },
  ...[undefined, null, "1000", -1, 1.5, NaN, Infinity, 8_640_000_000_000_001].map((finishedAt) => ({
    ...summary,
    finishedAt
  }))
])("rejects invalid stored summary %j", (data) => {
  expect(summarySchema.safeParse(data).success).toBe(false);
});
