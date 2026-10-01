import { SessionManager, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
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

it("replays persisted totals and details using the saved finish time, not the entry timestamp", () => {
  const data = {
    durationMs: 83000,
    finishedAt,
    bashCalls: 4,
    throughput: { outputTokens: 200, durationMs: 6000 },
    files: [
      { path: "src/a.ts", status: "available", added: 40, removed: 10 },
      { path: "src/b.ts", status: "available", added: 2, removed: 1 },
      { path: "src/empty.ts", status: "available", added: 0, removed: 0 }
    ]
  };
  const entry = savedEntry(data);
  const rows = renderSummary(entry, { expanded: false }, theme)!.render(120);
  const text = rows.join("\n");
  expect(rows[0]).toMatch(/^• 1m 23s /);
  expect(rows[0]).toContain("33.3 tok/s");
  expect(rows[0]).toContain("ran 4 commands");
  expect(rows[0]).toContain("edited 3 files");
  expect(rows[0]).toContain("+42 −11");
  expect(text).not.toContain("\n");
  expect(text).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  expect(text).not.toContain("src/a.ts");

  const expanded = renderSummary(entry, { expanded: true }, theme)!.render(120).join("\n");
  entry.timestamp = new Date(finishedAt + 60_000).toISOString();
  expect(renderSummary(entry, { expanded: true }, theme)!.render(120).join("\n")).toBe(expanded);
  const later = savedEntry({ ...data, finishedAt: finishedAt + 60_000 });
  expect(renderSummary(later, { expanded: false }, theme)!.render(120).join("\n")).toBe(text);
  expect(renderSummary(later, { expanded: true }, theme)!.render(120).join("\n")).not.toBe(
    expanded
  );

  expect(expanded).toMatch(/^▾ 1m 23s \(\d{1,2}:\d{2}:\d{2} [AP]M\)/);
  expect(expanded).toContain("33.3 tok/s");
  expect(expanded).toMatch(/^ {2}├ src\/a\.ts[^\n]*\+40\s+−10/m);
  expect(expanded).toMatch(/^ {2}├ src\/b\.ts[^\n]*\+2\s+−1/m);
  expect(expanded).toMatch(/^ {2}└ src\/empty\.ts/m);
});

it("keeps wrapped metadata and file details aligned after their markers", () => {
  const entry = savedEntry({
    durationMs: 83000,
    finishedAt,
    models: [{ provider: "anthropic", id: "claude-opus-5-5", thinkingLevel: "medium" }],
    throughput: { outputTokens: 200, durationMs: 6000 },
    bashCalls: 4,
    files: [
      {
        path: "src/long-directory/another-directory/例.ts",
        status: "available",
        added: 42,
        removed: 11
      },
      {
        path: "src/long-directory/another-directory/other.ts",
        status: "unavailable",
        reason: "Source too large."
      }
    ]
  });
  const component = renderSummary(entry, { expanded: true }, theme)!;
  const rows = component.render(40);
  expect(rows[0]).toMatch(/^▾ /);
  expect(rows.slice(1).every((row) => row.startsWith("  "))).toBe(true);
  expect(rows.every((row) => visibleWidth(row) <= 40)).toBe(true);
  const firstFile = rows.findIndex((row) => row.startsWith("  ├ "));
  const lastFile = rows.findIndex((row) => row.startsWith("  └ "));
  expect(firstFile).toBeGreaterThan(0);
  expect(lastFile).toBeGreaterThan(firstFile + 1);
  expect(rows[firstFile + 1]).toMatch(/^ {2}│ /);
  expect(rows[lastFile + 1]).toMatch(/^ {4}\S/);
  const content = (lines: string[]) =>
    lines
      .map((line) => line.replace(/^ {2}[├└│] /, ""))
      .join("")
      .replace(/\s/g, "");
  expect(content(rows)).toBe(content(component.render(120)));
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
  expect(initial[0]).toMatch(expanded ? /^▾ / : /^• /);
  expect(component.handleMouse?.(click)).toEqual({ handled: true });
  const toggled = component.render(120).join("\n");
  expect(toggled).toMatch(expanded ? /^• / : /^▾ /);
  expect(toggled.includes("  └ src/a.ts")).toBe(!expanded);
  expect(/\d{1,2}:\d{2}:\d{2}/.test(toggled)).toBe(!expanded);
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

it("leaves scrolling, selection, and other buttons unhandled", () => {
  const component = renderSummary(summaryWithFile(), { expanded: false }, theme)!;
  const initial = component.render(120);

  for (const type of ["press", "release", "move", "drag", "wheel"] as const) {
    expect(component.handleMouse?.({ ...click, type })).toBeUndefined();
  }

  for (const button of ["middle", "right"] as const) {
    expect(component.handleMouse?.({ ...click, button })).toBeUndefined();
  }

  expect(component.render(120)).toEqual(initial);
});

it("toggles the finish time even without file details", () => {
  const empty = renderSummary(
    savedEntry({ durationMs: 12000, finishedAt, bashCalls: 1, files: [] }),
    { expanded: false },
    theme
  )!;
  const initial = empty.render(120);
  expect(initial.join("\n")).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  expect(initial[0]).toMatch(/^• /);
  expect(empty.handleMouse?.(click)).toEqual({ handled: true });
  const expanded = empty.render(120).join("\n");
  expect(expanded).toMatch(/^▾ /);
  expect(expanded).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  expect(empty.handleMouse?.(click)).toEqual({ handled: true });
  expect(empty.render(120)).toEqual(initial);
});

it("distinguishes unavailable statistics from no changes without adding them to totals", () => {
  const base = { durationMs: 0, finishedAt, bashCalls: 0, files: [] };
  const text = (data: unknown, expanded = false) =>
    renderSummary(savedEntry(data), { expanded }, theme)!.render(120).join("\n");
  expect(text(base)).not.toMatch(/unavailable|edited|tok\/s/i);
  const unavailable = { path: "large.txt", status: "unavailable", reason: "Source too large." };
  expect(text({ ...base, files: [unavailable] }).trimEnd()).toBe(
    "• 0s · Statistics unavailable for 1 file"
  );
  expect(text({ ...base, files: [unavailable] })).not.toContain("edited");
  const mixed = {
    ...base,
    files: [
      { path: "file.txt", status: "available", added: 2, removed: 1 },
      unavailable,
      { ...unavailable, path: "other.txt" }
    ]
  };
  expect(text(mixed)).toMatch(/^• 0s · edited 1 file/);
  expect(text(mixed)).not.toContain("\n");
  expect(text(mixed)).toContain("+2 −1");
  expect(text(mixed)).toContain("Statistics unavailable for 2 files");
  expect(text(mixed, true)).toMatch(/^ {2}├ large\.txt[^\n]*Source too large\./m);
  expect(text(mixed, true)).toMatch(/^ {2}└ other\.txt[^\n]*Source too large\./m);
});

it("leads with the models that answered, omitting them for summaries without a model", () => {
  const base = { durationMs: 83000, finishedAt, bashCalls: 0, files: [] };
  const text = (data: unknown, expanded = false) =>
    renderSummary(savedEntry(data), { expanded }, theme)!.render(120).join("\n");
  const models = [{ provider: "anthropic", id: "claude-opus-5-5", thinkingLevel: "medium" }];
  const withModel = text({ ...base, models });
  expect(withModel.trimEnd()).toMatch(/^• anthropic\/claude-opus-5-5:medium \S+ 1m 23s$/);

  for (const expanded of [false, true]) {
    const withThroughput = text(
      { ...base, models, bashCalls: 1, throughput: { outputTokens: 200, durationMs: 6000 } },
      expanded
    );
    expect(
      withThroughput.startsWith(
        `${expanded ? "▾" : "•"} anthropic/claude-opus-5-5:medium (33.3 tok/s) · 1m 23s `
      )
    ).toBe(true);
    expect(/\d{1,2}:\d{2}:\d{2}/.test(withThroughput)).toBe(expanded);
    expect(withThroughput).toContain("ran 1 command");
    expect(withThroughput).not.toContain("\n");
    expect(withThroughput.match(/tok\/s/g)).toHaveLength(1);
  }

  expect(
    text({
      ...base,
      models: [
        { provider: "openai", id: "gpt-5-mini", thinkingLevel: "off" },
        { provider: "openai", id: "gpt-5-nano" }
      ]
    })
  ).toContain("openai/gpt-5-mini:off → openai/gpt-5-nano · 1m 23s");
  expect(text(base).trimEnd()).toBe("• 1m 23s");
  expect(text(base)).not.toContain("\n");
});

it("hides a saved summary without a finish timestamp", () => {
  const entry = savedEntry({ durationMs: 1000, bashCalls: 0, files: [] });
  expect(renderSummary(entry, { expanded: false }, theme)).toBeUndefined();
});
