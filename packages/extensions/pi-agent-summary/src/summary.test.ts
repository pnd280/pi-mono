import { expect, it } from "vite-plus/test";

import { formatDuration, summarySchema } from "./summary.ts";

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
  { durationMs: "1000" },
  { durationMs: -1 },
  { durationMs: Infinity },
  { durationMs: 1.5 },
  { durationMs: 1000 },
  { durationMs: 1000, bashCalls: -1, files: [] },
  {
    durationMs: 1000,
    bashCalls: 1,
    files: [{ path: "file", status: "available", added: -1, removed: 0 }]
  },
  { durationMs: 1000, bashCalls: 1, files: [{ path: "file", status: "unavailable" }] }
])("rejects invalid stored summary %j", (data) => {
  expect(summarySchema.safeParse(data).success).toBe(false);
});

it("ignores unknown fields in valid summaries", () => {
  const summary = { durationMs: 1234, bashCalls: 2, files: [] };
  expect(summarySchema.parse({ ...summary, extra: "ignored" })).toEqual(summary);
});
