import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { builtinCategories, otherCategory } from "../summary/categories.ts";
import type { RunSummary, SummaryCounts, SummarySegment } from "../summary/model.ts";
import { renderRunSummary } from "./summary-line.ts";

const plain = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};

// Tags make semantic colors visible without asserting full ANSI output.
const tagged = {
  ...plain,
  fg: (color: string, text: string) => `<${color}>${text}</>`,
  bold: (text: string) => `<b>${text}</b>`
};

function segment(id: string, count: number, counts: Partial<SummaryCounts> = {}): SummarySegment {
  return {
    category: builtinCategories.get(id) ?? otherCategory(id),
    count,
    counts: { failed: 0, cancelled: 0, unavailable: 0, ...counts }
  };
}

function lines(
  segments: RunSummary["segments"],
  options: { width?: number; theme?: typeof plain } = {}
): string[] {
  return renderRunSummary(
    { segments },
    {
      width: options.width ?? 200,
      theme: options.theme ?? plain
    }
  );
}

const mixed = [
  segment("read", 4),
  segment("search", 2),
  segment("edit", 2),
  segment("shell", 2, { failed: 1 }),
  segment("create", 1)
];

it("lists supplied items in order with singular and plural counts", () => {
  expect(lines(mixed)).toEqual([
    "  Read 4 files · 2 searches · edited 2 files · ran 2 commands (1 failed) · created 1 file"
  ]);
});

it("indents every line by two spaces and wraps only between items", () => {
  const width = 40;
  const rendered = lines(mixed, { width });
  const items = [
    "Read 4 files",
    "2 searches",
    "edited 2 files",
    "ran 2 commands",
    "created 1 file"
  ];

  for (const row of rendered) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
  expect(rendered[0]?.startsWith("  Read ")).toBe(true);
  for (const row of rendered) expect(row).toMatch(/^ {2}[^•\s]/);
  const text = rendered
    .map((row) => row.slice(2).replaceAll(/ ?\([^)]*\)/g, ""))
    .filter(Boolean)
    .join(" · ");
  expect(text.split(" · ")).toEqual(items);
});

it("reserves two columns for indentation without exceeding narrow widths", () => {
  const read = [segment("read", 1)];
  expect(lines(read, { width: 13 })).toEqual(["  Read 1 file"]);
  expect(lines(read, { width: 3 }).map(stripTerminalSequences)).toEqual(["  …"]);
  expect(lines(read, { width: 1 }).map(stripTerminalSequences)).toEqual([" "]);
  expect(lines(read, { width: 0 })).toEqual([]);
});

it("colors verbs as actions, counts as text, and the rest as muted", () => {
  expect(
    lines(
      [segment("edit", 1), segment("shell", 1), segment("search", 1), segment("custom_tool", 1)],
      // Tags count toward the width.
      { theme: tagged, width: 400 }
    )
  ).toEqual([
    "  <accent><b>Edited</b></><muted> </><text>1</><muted> file</>" +
      "<dim> · </><accent>ran</><muted> </><text>1</><muted> command</>" +
      "<dim> · </><text>1</><muted> search</>" +
      "<dim> · </><accent>custom_tool</><muted> ×</><text>1</>"
  ]);
});

it("keeps tool names in their original case", () => {
  expect(lines([segment("mcp__Exa", 1), segment("Deploy", 1), segment("read", 1)])).toEqual([
    "  mcp__Exa ×1 · Deploy ×1 · read 1 file"
  ]);
});

it("normalizes adapter-declared count labels before putting them in a summary row", () => {
  const category = {
    id: "custom",
    count: {
      one: "\x1b]52;c;YQ==\x07read {n} file\ncontinued",
      other: "read {n} files"
    }
  };
  const rendered = lines([
    { category, count: 1, counts: { failed: 0, cancelled: 0, unavailable: 0 } }
  ]);

  expect(rendered).toEqual(["  Read 1 file continued"]);
});

it("colors problem counts without adding an outcome marker", () => {
  const success = lines([segment("read", 1)], {
    theme: tagged
  });
  expect(success[0]).toBe("  <accent><b>Read</b></><muted> </><text>1</><muted> file</>");

  const problems = lines(
    [segment("list", 1, { unavailable: 1 }), segment("read", 1, { cancelled: 1 })],
    { theme: tagged }
  );
  expect(problems).toEqual([
    "  <accent><b>Listed</b></><muted> </><text>1</><muted> dir</><muted> (1 unavailable)</>" +
      "<dim> · </><accent>read</><muted> </><text>1</><muted> file</><error> (1 cancelled)</>"
  ]);
});
