import path from "node:path";

import { initTheme, type MessageRenderer, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { noticeEntry, noticeSchema, type Notice } from "pi-nested-instructions/notices";
import { expect, it } from "vite-plus/test";

import { createNoticeRenderer, noticeSummary } from "./index.ts";

initTheme("dark");
const theme: Pick<Theme, "fg" | "bold"> = {
  fg: (_color, text) => text,
  bold: (text) => text
};
const renderer = () => createNoticeRenderer();

function notice(action: Notice["action"] = "loaded", file = "src/AGENTS.md") {
  const body = "# Project rules\n\nUse **strict types**.\n\n- Run tests\n- Keep changes small";
  const cwd = process.cwd();
  const entry =
    action === "removed"
      ? noticeEntry(path.resolve(file), undefined, action, cwd)
      : noticeEntry(
          path.dirname(path.resolve(file)),
          { path: path.resolve(file), stamp: "stamp", content: body },
          action,
          cwd
        );

  return {
    role: "custom",
    customType: entry.customType,
    content: entry.content,
    display: entry.display,
    timestamp: 0,
    details: noticeSchema.parse(entry.details)
  } satisfies Parameters<MessageRenderer>[0];
}

const options = { expanded: false, outputPad: 1 };
const click: TuiMouseEvent = {
  type: "click",
  button: "left",
  x: 2,
  y: 0,
  screenX: 2,
  screenY: 0,
  width: 100,
  height: 1,
  shift: false,
  alt: false,
  ctrl: false
};

it.each([
  ["loaded", "src/AGENTS.md", "loaded {n} instruction file", "loaded {n} instruction files"],
  ["updated", "src/AGENTS.md", "updated {n} instruction file", "updated {n} instruction files"],
  ["removed", "src", "removed instructions from {n} dir", "removed instructions from {n} dirs"]
] as const)("summarizes %s notices using their persisted identity", (action, file, one, other) => {
  const message = notice(action, file);
  const before = JSON.stringify(message);
  expect(noticeSummary(message.details)).toEqual({
    category: { id: `pi-nested-instructions:${action}`, count: { one, other } },
    identity: path.resolve(file)
  });
  // Display spelling is not a summary identity and can survive a cwd change.
  expect(noticeSummary({ ...message.details, displayPath: "elsewhere" })?.identity).toBe(
    path.resolve(file)
  );
  expect(JSON.stringify(message)).toBe(before);
});

it("omits summary counts for invalid notice details", () => {
  const { details } = notice();

  for (const invalid of [undefined, {}, { ...details, version: 2 }, { ...details, action: "read" }])
    expect(noticeSummary(invalid)).toBeUndefined();
});

it.each(["loaded", "updated", "removed"] as const)(
  "keeps %s notices compact and leaves full instructions in model context",
  (action) => {
    const message = notice(action, action === "removed" ? "src" : "src/AGENTS.md");
    const before = JSON.stringify(message);
    const render = renderer();
    const rows = render(message, options, theme).render(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^• /);
    expect(rows[0]?.toLowerCase()).toContain(action);
    expect(rows[0]).toContain(action === "removed" ? "src" : "src/AGENTS.md");
    expect(rows[0]).not.toMatch(/nested instructions from|supersedes|no longer apply/);
    const expanded = render(message, { ...options, expanded: true }, theme).render(100);
    expect(expanded[0]).toMatch(/^• /);
    expect(expanded[1]).toMatch(action === "updated" ? /^  ├ / : /^  └ /);
    const text = expanded.join("\n");

    if (action === "removed") expect(text).toContain("no longer apply");
    else {
      expect(text).toContain("Project rules");
      expect(text).not.toContain("# Project rules");
      expect(text).not.toContain("**strict types**");
      expect(text.match(/src\/AGENTS.md/g)).toHaveLength(1);
      if (action === "updated") expect(text).toContain("Replaces");
    }

    expect(JSON.stringify(message)).toBe(before);
  }
);

it("toggles the clicked header, retains its state across rebuilds, and follows global expansion", () => {
  const render = renderer();
  const message = notice();
  const component = render(message, options, theme);
  const other = render(notice(), options, theme);
  component.render(100);
  expect(component.handleMouse(click)).toEqual({ handled: true });
  expect(component.render(100).join("\n")).toContain("Project rules");
  expect(other.render(100).join("\n")).not.toContain("Project rules");
  component.invalidate();
  expect(render(message, options, theme).render(100).join("\n")).toContain("Project rules");
  render(message, { ...options, expanded: true }, theme);
  expect(render(message, options, theme).render(100).join("\n")).not.toContain("Project rules");
});

it("does not toggle on body selection, scrolling, dragging, or other mouse buttons", () => {
  const component = renderer()(notice(), { ...options, expanded: true }, theme);
  const initial = component.render(100);

  for (const event of [
    { ...click, y: 3 },
    { ...click, button: "right" as const },
    { ...click, type: "wheel" as const },
    { ...click, type: "drag" as const }
  ]) {
    expect(component.handleMouse(event)).toBeUndefined();
  }

  expect(component.render(100)).toEqual(initial);
});

it.each([false, true])(
  "fits narrow widths with expanded=%s and preserves full paths",
  (expanded) => {
    const file = "packages/very-long-directory/例子/AGENTS.override.md";
    const component = renderer()(notice("loaded", file), { expanded, outputPad: 3 }, theme);
    const rows = component.render(24);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toMatch(/^• /);
    expect(rows.slice(1).every((row) => !row.trim() || row.startsWith("  "))).toBe(true);
    expect(rows.join("").replace(/[\s│]/g, "")).toContain(file);
    expect(rows[1]).toMatch(expanded ? /^  │ {6}/ : /^ {9}/);

    for (const width of [1, 2, 3, 8, 24, 100]) {
      expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }

    expect(component.render(0)).toEqual([]);
  }
);

it("sanitizes unusual paths without losing instruction text or repeating the model preamble", () => {
  const message = notice("loaded", "src/line\n\nbreak\x1b[31m/AGENTS.md");
  const render = renderer();
  const collapsed = render(message, options, theme).render(100);
  expect(collapsed).toHaveLength(1);
  expect(collapsed[0]).toContain("src/line break/AGENTS.md");
  expect(collapsed[0]).not.toContain("\x1b");
  const expanded = render(message, { ...options, expanded: true }, theme)
    .render(100)
    .join("\n");
  expect(expanded).toContain("Project rules");
  expect(expanded).not.toContain("nested instructions from");
});

it("strips the preamble using the path shown to the model, not the current cwd", () => {
  const cwd = path.join(process.cwd(), "elsewhere");
  const file = path.join(cwd, "pkg/AGENTS.md");
  const entry = noticeEntry(
    path.dirname(file),
    { path: file, stamp: "stamp", content: "Rules body" },
    "loaded",
    cwd
  );
  const message = { role: "custom" as const, timestamp: 0, ...entry };
  const rows = renderer()(message, { ...options, expanded: true }, theme)
    .render(100)
    .join("\n");
  expect(rows).toContain("pkg/AGENTS.md");
  expect(rows).toContain("Rules body");
  expect(rows).not.toContain("nested instructions from");
});
