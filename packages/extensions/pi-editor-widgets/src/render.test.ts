import {
  stripTerminalSequences,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
  type Component
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { clip, renderRows as renderStyledRows, type Contribution } from "./render.ts";

const renderRows = (rows: string[][], sources: ReadonlyMap<string, Contribution>, width: number) =>
  renderStyledRows(rows, sources, width, "\x1b[2m • \x1b[22m");

const source = (render: Component["render"]): Contribution => ({
  component: { render, invalidate() {} }
});
const text = (value: string) => source((width) => wrapTextWithAnsi(value, width));
const plain = (lines: string[]) => lines.map(stripTerminalSequences);

it("collapses bullets past empty widgets but never across flex or at row boundaries", () => {
  const sources = new Map([
    ["a", text("A")],
    ["b", text("")],
    ["c", text("C")]
  ]);
  expect(
    plain(
      renderRows(
        [["separator", "a", "separator", "b", "separator", "separator", "c", "separator"]],
        sources,
        20
      ).lines
    )
  ).toEqual(["A • C"]);
  expect(
    plain(renderRows([["a", "separator", "b", "flex", "separator", "c"]], sources, 10).lines)
  ).toEqual(["A        C"]);
  expect(renderRows([["b", "separator", "b"]], sources, 20).lines).toEqual([]);
});

it("lets the terminal width, not neighbouring widgets, determine responsive content", () => {
  const sources = new Map([
    ["a", text("A")],
    ["b", source((width) => (width >= 20 ? ["wide-only-content"] : []))],
    ["c", text("C")]
  ]);
  const rows = [["a", "separator", "b", "c"]];
  expect(plain(renderRows(rows, sources, 20).lines)).toEqual(["A", "wide-only-content C"]);
  expect(plain(renderRows(rows, sources, 10).lines)).toEqual(["A • C"]);
});

it("renders a singleton at full width, preserves blank lines and padding, and remeasures changing output", () => {
  let expanded = true;
  const render = vi.fn((width: number) =>
    expanded ? ["+".repeat(width), "  body  ", "", "bottom"] : []
  );
  const sources = new Map([["native", source(render)]]);
  expect(plain(renderRows([["native"]], sources, 12).lines)).toEqual([
    "++++++++++++",
    "  body  ",
    "",
    "bottom"
  ]);
  expect(render).toHaveBeenCalledWith(12);
  expanded = false;
  expect(renderRows([["native"]], sources, 12).lines).toEqual([]);
  expanded = true;
  expect(renderRows([["native"]], sources, 20).lines).toHaveLength(4);
});

it("preserves multiline content and only separates visible contributions", () => {
  const sources = new Map([
    ["a", source(() => ["A", "", "last"])],
    ["b", text("B")]
  ]);
  const lines = plain(renderRows([["a", "separator", "b"]], sources, 30).lines);
  expect(lines.map((line) => line.split("•")[0]?.trim())).toEqual(["A", "", "last"]);
  const separated = lines.filter((line) => line.includes("•"));
  expect(separated).toHaveLength(1);
  expect(separated[0]).toMatch(/(?:A|last)\s+•\s+B/);
});

it("renders each placement once while preserving wrapped content and full-width borders", () => {
  const left = vi.fn((width: number) => new Text("left content wraps around", 1, 0).render(width));
  const right = vi.fn((width: number) => ["+".repeat(width), "|bordered|", "+".repeat(width)]);
  const result = renderRows(
    [["a", "separator", "b"]],
    new Map([
      ["a", source(left)],
      ["b", source(right)]
    ]),
    27
  );
  for (const render of [left, right]) expect(render).toHaveBeenCalledExactlyOnceWith(27);
  const lines = plain(result.lines);
  for (const value of ["left", "content", "wraps", "around", "|bordered|"])
    expect(lines.join("\n")).toContain(value);
  expect(lines.filter((line) => line.includes("+"))).toHaveLength(2);
  expect(result.lines.every((line) => visibleWidth(line) <= 27)).toBe(true);
});

it.each([0, 1, 2, 3, 5, 10, 20, 40])(
  "keeps ANSI/wide text within %i columns without mutating row membership",
  (width) => {
    const row = ["a", "separator", "b", "flex", "c"];
    const sources = new Map([
      ["a", text("\x1b[31m界界👩‍💻\x1b[0m")],
      ["b", text("wrapped content")],
      ["c", text("tail")]
    ]);
    const result = renderRows([row], sources, width);
    expect(result.lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(
      plain(result.lines).every(
        (line) => !line.trim().startsWith("•") && !line.trim().endsWith("•")
      )
    ).toBe(true);
    expect(row).toEqual(["a", "separator", "b", "flex", "c"]);
  }
);

it.each(["\x1b[44m", "\x1b[7m", "\x1b[4m", "\x1b]8;;https://example.com\x07\x1b[0m"])(
  "preserves painted or decorated padding (%s) in shared cells",
  (style) => {
    const result = renderRows(
      [["a", "separator", "b"]],
      new Map([
        ["a", source((width) => [style + "A".padEnd(width)])],
        ["b", text("B")]
      ]),
      20
    );
    expect(plain(result.lines)).toEqual(["A".padEnd(20), "B"]);
    expect(result.cells[0]?.width).toBe(20);
    expect(result.lines[0]).toContain(style);
  }
);

it.each([
  { width: 30, values: ["a".repeat(30), "b".repeat(30)], expectedRows: [[0], [1]] },
  {
    width: 30,
    values: ["a".repeat(20), "b".repeat(20), "c".repeat(6)],
    expectedRows: [[0], [1, 2]]
  },
  {
    width: 40,
    values: ["a".repeat(20), "b".repeat(20), "c".repeat(20)],
    expectedRows: [[0], [1], [2]]
  },
  {
    width: 52,
    values: ["a", "b", "c", "d"].map((c) => Array(3).fill(c.repeat(6)).join(" ")),
    expectedRows: [
      [0, 1],
      [2, 3]
    ]
  }
])(
  "wraps $values.length intact widgets in order at $width columns",
  ({ width, values, expectedRows }) => {
    const renders = values.map((value) => vi.fn((w: number) => wrapTextWithAnsi(value, w)));
    const result = renderRows(
      [values.map((_, i) => String(i))],
      new Map(renders.map((render, i) => [String(i), source(render)])),
      width
    );
    expect(plain(result.lines)).toEqual(
      expectedRows.map((row) => row.map((index) => values[index]).join(" "))
    );
    for (const render of renders) expect(render).toHaveBeenCalledExactlyOnceWith(width);
  }
);

it("keeps narrow footer fields intact and restores shared rows after resizing", () => {
  const values = new Map([
    ["cwd", "~/projects/pi-mono"],
    ["branch", "master"],
    ["model", "openai-codex/gpt-6-astra:xhigh"],
    ["title", "A Simple Greeting"],
    ["tokens", "↑5.8k ↓14 $0.058 (sub)"],
    ["context", "5.8k/272k (2.1%) (auto)"]
  ]);
  const sources = new Map([...values].map(([id, value]) => [id, text(`\x1b[2m${value}\x1b[22m`)]));
  const rows = [
    ["cwd", "separator", "branch", "flex", "model"],
    ["title", "flex", "tokens", "separator", "context"]
  ];

  for (const width of [42, 80, 42]) {
    const result = renderRows(rows, sources, width);
    const lines = plain(result.lines);
    expect(lines).toHaveLength(width === 42 ? 4 : 2);
    for (const value of values.values())
      expect(lines.some((line) => line.includes(value))).toBe(true);
    expect(result.cells.every((cell) => cell.height === 1)).toBe(true);
    expect(result.lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(lines[0]).toContain("~/projects/pi-mono • master");
    expect(lines.find((line) => line.includes("openai-codex"))).toHaveLength(width);
    expect(lines.at(-1)).toHaveLength(width);
    expect(lines.every((line) => !line.trim().startsWith("•") && !line.trim().endsWith("•"))).toBe(
      true
    );
  }
});

it.each([false, true])(
  "wraps responsive widgets without shrinking their content (padded: %s)",
  (padded) => {
    const responsive = vi.fn((width: number) => {
      const value = width >= 40 ? "wide content".repeat(3) : "hi";

      return padded ? new Text(value, 1, 0).render(width) : [value];
    });
    const neighbour = vi.fn((width: number) => wrapTextWithAnsi("b".repeat(30), width));
    const result = renderRows(
      [["a", "separator", "b"]],
      new Map([
        ["a", source(responsive)],
        ["b", source(neighbour)]
      ]),
      40
    );
    expect(plain(result.lines)).toEqual([
      (padded ? " " : "") + "wide content".repeat(3),
      "b".repeat(30)
    ]);
    expect(responsive).toHaveBeenCalledExactlyOnceWith(40);
    expect(neighbour).toHaveBeenCalledExactlyOnceWith(40);
  }
);

it("includes separator width in exact fits and starts wrapped rows after the tallest widget", () => {
  const sources = new Map([
    ["a", source(() => ["alpha", "tail"])],
    ["b", text("beta")],
    ["c", text("gamma")]
  ]);
  const rows = [["a", "separator", "b", "separator", "c"]];
  expect(plain(renderRows(rows, sources, 12).lines).map((line) => line.trimEnd())).toEqual([
    "alpha • beta",
    "tail",
    "gamma"
  ]);
  expect(plain(renderRows(rows, sources, 11).lines)).toEqual(["alpha", "tail", "beta", "gamma"]);
});

it("keeps ragged multiline separators next to the following column", () => {
  const result = renderRows(
    [["a", "separator", "b"]],
    new Map([
      ["a", source(() => ["long line here", "x"])],
      ["b", source(() => ["B1", "B2"])]
    ]),
    40
  );
  expect(plain(result.lines)).toEqual(["long line here • B1", "x              • B2"]);
});

it("bottom-aligns shorter items and their mouse cells when requested", () => {
  const sources = new Map([
    ["a", source(() => ["A1", "A2", "A3"])],
    ["b", source(() => ["B"])]
  ]);
  const result = renderStyledRows([["a", "separator", "b"]], sources, 20, " • ", "bottom");
  expect(plain(result.lines).map((line) => line.trimEnd())).toEqual(["A1", "A2", "A3 • B"]);
  expect(result.cells.map(({ x, y, height }) => ({ x, y, height }))).toEqual([
    { x: 0, y: 0, height: 3 },
    { x: 5, y: 2, height: 1 }
  ]);
});

it("stacks at narrow widths in sequence and supports one-sided flex", () => {
  const sources = new Map([
    ["a", text("alpha")],
    ["b", text("beta")]
  ]);
  expect(plain(renderRows([["a", "separator", "b"]], sources, 5).lines)).toEqual(["alpha", "beta"]);
  expect(plain(renderRows([["flex", "b"]], sources, 10).lines)).toEqual(["      beta"]);
  expect(plain(renderRows([["b", "flex"]], sources, 10).lines)).toEqual(["beta"]);
  const result = clip(renderRows([["a"], ["b"]], sources, 20), 1, 20);
  expect(result.lines).toEqual(["… widgets clipped"]);
  expect(result.cells).toEqual([]);
});
