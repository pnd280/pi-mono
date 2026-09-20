import { SessionManager, type Theme } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { createSummaryRenderer } from "./render.ts";
import { summaryEntryType } from "./summary.ts";

const theme: Pick<Theme, "fg"> = { fg: (_color, text) => text };
const renderSummary = createSummaryRenderer();

function savedEntry(data: unknown) {
  const session = SessionManager.inMemory();
  const id = session.appendCustomEntry(summaryEntryType, data);
  const entry = session.getEntry(id);
  if (entry?.type !== "custom") throw new Error("Missing custom entry");

  return entry;
}

it("replays persisted statistics with diff colors and expands the per-file breakdown", () => {
  const entry = savedEntry({
    durationMs: 12000,
    bashCalls: 4,
    files: [
      { path: "src/a.ts", status: "available", added: 40, removed: 10 },
      { path: "src/b.ts", status: "available", added: 2, removed: 1 }
    ]
  });
  const fg = vi.fn(theme.fg);
  const collapsed = renderSummary(entry, { expanded: false }, { fg });
  expect(collapsed?.render(120).join("\n").trim()).toBe(
    "Worked for 12s · 4 bash calls · 2 files · +42 −11"
  );
  expect(fg).toHaveBeenCalledWith("toolDiffAdded", "+42");
  expect(fg).toHaveBeenCalledWith("toolDiffRemoved", "−11");
  expect(fg).toHaveBeenCalledWith("dim", "2 files");
  fg.mockClear();
  collapsed?.invalidate();
  collapsed?.render(120);
  expect(fg).toHaveBeenCalledWith("toolDiffAdded", "+42");
  const expanded = renderSummary(entry, { expanded: true }, theme)?.render(120).join("\n");
  expect(expanded).toContain("src/a.ts · +40 −10");
  expect(expanded).toContain("src/b.ts · +2 −1");
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
    savedEntry({ durationMs: 12000, bashCalls: 1, files: [] }),
    { expanded: false },
    theme
  )!;
  empty.render(120);
  expect(empty.handleMouse?.(click)).toBeUndefined();
});

it("omits unavailable statistics from totals and rejects malformed summaries", () => {
  const base = { durationMs: 0, bashCalls: 0, files: [] };
  const text = (data: unknown) =>
    renderSummary(savedEntry(data), { expanded: false }, theme)?.render(120).join("\n").trim();
  expect(text(base)).toBe("Worked for 0s");
  const unavailable = { path: "large.txt", status: "unavailable", reason: "Too large." };
  expect(text({ ...base, files: [unavailable] })).toBe("Worked for 0s");
  expect(
    text({
      ...base,
      files: [{ path: "file.txt", status: "available", added: 1, removed: 0 }, unavailable]
    })
  ).toBe("Worked for 0s · 1 file · +1");
  expect(text({ durationMs: 1000 })).toBeUndefined();
});
