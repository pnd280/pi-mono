import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { renderTree, renderTreeContinuation } from "./index.ts";

it("assigns endings to visible siblings and preserves rails through wrapped rows", () => {
  const items = [{ rows: ["first", "wrapped"] }, { rows: [] }, { rows: ["last", "metadata"] }];
  expect(renderTree(items, { width: 80 })).toEqual([
    "├ first",
    "│ wrapped",
    "└ last",
    "  metadata"
  ]);
  expect(renderTree(items.slice(0, 2), { width: 80 })).toEqual(["└ first", "  wrapped"]);
  expect(
    renderTree([{ rows: ["first", "notice"] }], { width: 80, followingSibling: true })
  ).toEqual(["├ first", "│ notice"]);
  expect(renderTreeContinuation(["parameters"], { width: 80, hasChildren: true })).toEqual([
    "│ parameters"
  ]);
  expect(renderTreeContinuation(["parameters"], { width: 80 })).toEqual(["  parameters"]);
  expect(renderTree(items, { width: 0 })).toEqual([]);
  expect(renderTreeContinuation(["parameters"], { width: 0 })).toEqual([]);
});

it("honors consumer indentation and styling, including viewports narrower than the gutter", () => {
  for (const indent of [0, 2, 6]) {
    for (const width of [1, 2, 4, 5, 12, 80]) {
      const options = { width, indent, style: (text: string) => `\x1b[31m${text}\x1b[0m` };
      const rows = renderTree([{ rows: ["界 👩🏽‍💻 é", "wrapped"] }], options);
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
      expect(rows[0]).toContain("\x1b[31m");
      if (width === 80)
        expect(stripTerminalSequences(rows[0]!)).toBe(" ".repeat(indent) + "└ 界 👩🏽‍💻 é");
    }
  }
});
