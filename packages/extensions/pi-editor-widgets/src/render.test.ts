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

it("collapses separators across a widget that becomes empty only at its allocated width", () => {
  const sources = new Map([
    ["a", text("A")],
    ["b", source((width) => (width >= 20 ? ["longlonglonglonglong"] : []))],
    ["c", text("C")]
  ]);
  expect(plain(renderRows([["a", "separator", "b", "c"]], sources, 20).lines)).toEqual(["A • C"]);
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

it("shrinks shared components at allocated widths with at most two renders each", () => {
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
  expect(left.mock.calls).toEqual([[27], [12]]);
  expect(right.mock.calls).toEqual([[27], [12]]);
  expect(result.lines.length).toBeGreaterThanOrEqual(3);
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
