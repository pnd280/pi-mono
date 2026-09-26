import {
  Container,
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

it("bounds shared renders while preserving wrapped content and borders", () => {
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
  for (const render of [left, right]) expect(render.mock.calls.length).toBeLessThanOrEqual(3);
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

it("compacts native Text padding without rerendering it at a width that wraps its content", () => {
  const native = (value: string): Contribution => {
    const component = new Container();
    component.addChild(new Text(value, 1, 0));

    return { component };
  };

  const result = renderRows(
    [["a", "separator", "b", "separator", "c"]],
    new Map([
      ["a", native("\x1b[31mtodo: 3\x1b[39m")],
      ["b", native("build ok")],
      ["c", native("lsp")]
    ]),
    80
  );
  expect(plain(result.lines)).toEqual([" todo: 3 •  build ok •  lsp"]);
  expect(result.cells.map(({ x, width }) => ({ x, width }))).toEqual([
    { x: 0, width: 8 },
    { x: 11, width: 9 },
    { x: 23, width: 4 }
  ]);
});

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
    expect(plain(result.lines)).toEqual(["A                • B"]);
    expect(result.cells[0]?.width).toBe(16);
    expect(result.lines[0]).toContain(style);
  }
);

it.each([
  { width: 30, values: ["a".repeat(30), "b".repeat(30)], height: 2 },
  { width: 30, values: ["a".repeat(20), "b".repeat(20), "c".repeat(6)], height: 2 },
  {
    width: 52,
    values: ["a", "b", "c", "d"].map((c) => Array(3).fill(c.repeat(6)).join(" ")),
    height: 2
  }
])(
  "uses a shorter natural-width reflow at $width columns for $values.length widgets",
  ({ width, values, height }) => {
    const renders = values.map((value) => vi.fn((w: number) => wrapTextWithAnsi(value, w)));
    const result = renderRows(
      [values.map((_, i) => String(i))],
      new Map(renders.map((render, i) => [String(i), source(render)])),
      width
    );
    expect(result.lines).toHaveLength(height);
    for (const value of values) expect(plain(result.lines).join("\n")).toContain(value);
    expect(result.lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    for (const render of renders) expect(render.mock.calls.length).toBeLessThanOrEqual(3);
  }
);

it("returns a disappearing widget's allocation to its neighbours without resurrecting it", () => {
  const shy = vi.fn((width: number) => (width >= 30 ? ["wide-only-content-xxxxxxxxxxx"] : []));
  const a = vi.fn((width: number) => wrapTextWithAnsi("a ".repeat(20).trim(), width));
  const b = vi.fn((width: number) => wrapTextWithAnsi("b ".repeat(20).trim(), width));
  const result = renderRows(
    [["a", "separator", "shy", "separator", "b"]],
    new Map([
      ["a", source(a)],
      ["shy", source(shy)],
      ["b", source(b)]
    ]),
    60
  );
  expect(result.lines).toHaveLength(2);
  expect(result.cells).toHaveLength(2);
  expect(result.cells.every((cell) => cell.renderWidth >= 28)).toBe(true);
  expect(plain(result.lines).join("\n")).not.toContain("wide-only");
  for (const render of [a, b, shy]) expect(render.mock.calls.length).toBeLessThanOrEqual(3);
});

it.each([false, true])(
  "redistributes unused space without rewrapping responsive content (padded: %s)",
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
    expect(plain(result.lines)).toEqual([(padded ? " hi" : "hi") + " • " + "b".repeat(30)]);
    expect(responsive.mock.calls.length).toBeLessThanOrEqual(3);
    expect(neighbour.mock.calls.length).toBeLessThanOrEqual(3);
  }
);

it("bounds recovery even when another widget disappears at the recovered width", () => {
  const a = vi.fn((width: number) => (width === 42 ? ["a".repeat(30)] : []));
  const b = vi.fn((width: number) => {
    if (width >= 30) return ["b".repeat(30)];

    return width >= 15 ? [] : ["B", "B"];
  });
  const c = vi.fn((width: number) => wrapTextWithAnsi("c".repeat(30), width));
  const result = renderRows(
    [["a", "separator", "b", "separator", "c"]],
    new Map([
      ["a", source(a)],
      ["b", source(b)],
      ["c", source(c)]
    ]),
    42
  );
  expect(result.cells).toHaveLength(1);
  expect(plain(result.lines).join("").trim()).toBe("c".repeat(30));
  for (const render of [a, b, c]) expect(render.mock.calls.length).toBeLessThanOrEqual(3);
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
