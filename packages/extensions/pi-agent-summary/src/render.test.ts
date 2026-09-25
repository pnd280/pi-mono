import { SessionManager, type Theme } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { createSummaryRenderer } from "./render.ts";
import { summaryEntryType } from "./summary.ts";

const theme: Pick<Theme, "fg"> = { fg: (_color, text) => text };
const renderSummary = createSummaryRenderer();
const finishedAt = new Date(2026, 0, 1, 14, 34, 56).getTime();

function savedEntry(data: unknown) {
  const session = SessionManager.inMemory();
  const id = session.appendCustomEntry(summaryEntryType, data);
  const entry = session.getEntry(id);
  if (entry?.type !== "custom") throw new Error("Missing custom entry");

  return entry;
}

it("replays persisted totals and details using the saved finish time, not the entry timestamp", () => {
  const data = {
    durationMs: 83000,
    finishedAt,
    bashCalls: 4,
    files: [
      { path: "src/a.ts", status: "available", added: 40, removed: 10 },
      { path: "src/b.ts", status: "available", added: 2, removed: 1 },
      { path: "src/empty.ts", status: "available", added: 0, removed: 0 }
    ]
  };
  const entry = savedEntry(data);
  const text = renderSummary(entry, { expanded: false }, theme)!.render(120).join("\n");
  for (const statistic of ["1m 23s", "4 bash", "3 files", "+42", "−11"])
    expect(text).toContain(statistic);
  expect(text).not.toContain("src/a.ts");

  entry.timestamp = new Date(finishedAt + 60_000).toISOString();
  expect(renderSummary(entry, { expanded: false }, theme)!.render(120).join("\n")).toBe(text);
  const later = savedEntry({ ...data, finishedAt: finishedAt + 60_000 });
  expect(renderSummary(later, { expanded: false }, theme)!.render(120).join("\n")).not.toBe(text);

  const expanded = renderSummary(entry, { expanded: true }, theme)!.render(120).join("\n");
  expect(expanded).toMatch(/src\/a\.ts[^\n]*\+40\s+−10/);
  expect(expanded).toMatch(/src\/b\.ts[^\n]*\+2\s+−1/);
  expect(expanded).toContain("src/empty.ts");
});

const click: TuiMouseEvent = {
  type: "click",
  button: "left",
  x: 2,
  y: 0,
  screenX: 2,
  screenY: 0,
  width: 120,
  height: 1,
  shift: false,
  alt: false,
  ctrl: false
};

function summaryWithFile() {
  return savedEntry({
    durationMs: 12000,
    finishedAt,
    bashCalls: 1,
    files: [{ path: "src/a.ts", status: "available", added: 2, removed: 1 }]
  });
}

it.each([false, true])("toggles only the clicked summary from expanded=%s", (expanded) => {
  const component = renderSummary(summaryWithFile(), { expanded }, theme)!;
  const other = renderSummary(summaryWithFile(), { expanded }, theme)!;
  const initial = component.render(120);
  expect(component.handleMouse?.(click)).toEqual({ handled: true });
  expect(component.render(120).join("\n").includes("src/a.ts")).toBe(!expanded);
  expect(other.render(120)).toEqual(initial);
  expect(component.handleMouse?.(click)).toEqual({ handled: true });
  expect(component.render(120)).toEqual(initial);
});

it("retains click expansion through renderer rebuilds and follows global expansion changes", () => {
  const entry = summaryWithFile();
  const component = renderSummary(entry, { expanded: false }, theme)!;
  component.render(120);
  component.handleMouse?.(click);
  component.invalidate();
  expect(renderSummary(entry, { expanded: false }, theme)?.render(80).join("\n")).toContain(
    "src/a.ts"
  );
  const globallyExpanded = renderSummary(entry, { expanded: true }, theme)!;
  expect(globallyExpanded.render(120).join("\n")).toContain("src/a.ts");
  expect(renderSummary(entry, { expanded: false }, theme)?.render(120).join("\n")).not.toContain(
    "src/a.ts"
  );
});

it("leaves scrolling, selection, other buttons, and summaries without details unhandled", () => {
  const component = renderSummary(summaryWithFile(), { expanded: false }, theme)!;
  const initial = component.render(120);

  for (const type of ["press", "release", "move", "drag", "wheel"] as const) {
    expect(component.handleMouse?.({ ...click, type })).toBeUndefined();
  }

  for (const button of ["middle", "right"] as const) {
    expect(component.handleMouse?.({ ...click, button })).toBeUndefined();
  }

  expect(component.render(120)).toEqual(initial);

  const empty = renderSummary(
    savedEntry({ durationMs: 12000, finishedAt, bashCalls: 1, files: [] }),
    { expanded: false },
    theme
  )!;
  empty.render(120);
  expect(empty.handleMouse?.(click)).toBeUndefined();
});

it("distinguishes unavailable statistics from no changes without adding them to totals", () => {
  const base = { durationMs: 0, finishedAt, bashCalls: 0, files: [] };
  const text = (data: unknown, expanded = false) =>
    renderSummary(savedEntry(data), { expanded }, theme)!.render(120).join("\n");
  expect(text(base)).not.toMatch(/unavailable|files? changed/i);
  const unavailable = { path: "large.txt", status: "unavailable", reason: "Source too large." };
  expect(text({ ...base, files: [unavailable] })).toContain("Statistics unavailable for 1 file");
  expect(text({ ...base, files: [unavailable] })).not.toContain("file changed");
  const mixed = {
    ...base,
    files: [
      { path: "file.txt", status: "available", added: 2, removed: 1 },
      unavailable,
      { ...unavailable, path: "other.txt" }
    ]
  };
  expect(text(mixed)).toContain("1 file changed");
  expect(text(mixed)).toContain("+2 −1");
  expect(text(mixed)).toContain("Statistics unavailable for 2 files");
  expect(text(mixed, true)).toContain("large.txt");
  expect(text(mixed, true)).toContain("Source too large.");
});

it("hides a saved summary without a finish timestamp", () => {
  const entry = savedEntry({ durationMs: 1000, bashCalls: 0, files: [] });
  expect(renderSummary(entry, { expanded: false }, theme)).toBeUndefined();
});
