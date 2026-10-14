import { SessionManager, type Theme } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { createSummaryRenderer } from "./render.ts";
import { summaryEntryType } from "./summary.ts";

const theme: Pick<Theme, "fg" | "bold"> = {
  fg: (_color, text) => text,
  bold: (text) => text
};
const renderSummary = createSummaryRenderer();
const finishedAt = new Date(2026, 0, 1, 14, 34, 56).getTime();

function savedEntry(data: unknown) {
  const session = SessionManager.inMemory();
  const id = session.appendCustomEntry(summaryEntryType, data);
  const entry = session.getEntry(id);
  if (entry?.type !== "custom") throw new Error("Missing custom entry");

  return entry;
}

it("distinguishes unavailable statistics from no changes without adding them to totals", () => {
  const base = { durationMs: 0, finishedAt, bashCalls: 0, files: [] };
  const text = (data: unknown, expanded = false) =>
    renderSummary(savedEntry(data), { expanded }, theme)!.render(120).join("\n");
  expect(text(base)).not.toMatch(/unavailable|edited/i);
  const unavailable = { path: "large.txt", status: "unavailable", reason: "Source too large." };
  expect(text({ ...base, files: [unavailable] })).toMatch(/unavailable.*1 file/i);
  expect(text({ ...base, files: [unavailable] })).not.toContain("edited");
  const mixed = {
    ...base,
    files: [
      { path: "file.txt", status: "available", added: 2, removed: 1 },
      unavailable,
      { ...unavailable, path: "other.txt" }
    ]
  };
  expect(text(mixed)).toMatch(/edited 1 file/);
  expect(text(mixed)).toContain("+2 -1");
  expect(text(mixed)).toMatch(/unavailable.*2 files/i);
  expect(text(mixed, true)).toMatch(/large\.txt[^\n]*Source too large\./);
  expect(text(mixed, true)).toMatch(/other\.txt[^\n]*Source too large\./);
});
