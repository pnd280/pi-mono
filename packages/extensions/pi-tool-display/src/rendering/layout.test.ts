import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";

import {
  bodyWidth,
  compactRows,
  compactText,
  renderTree,
  renderTreeContinuation,
  wrapRows
} from "./layout.ts";

describe("display row budgets", () => {
  it("bounds compact wrapping while retaining tail ANSI state, graphemes, and diagnostics", () => {
    const source = "\x1b[31mBEGIN\n" + "x".repeat(1024 * 1024) + "\n👩🏽‍💻 é\nFINAL ERROR\x1b[0m";
    const compact = compactText(source, 5, 80, "expand");
    expect(compact).toHaveLength(5);
    expect(stripTerminalSequences(compact[0]!)).toBe("BEGIN");
    expect(stripTerminalSequences(compact.at(-2)!)).toBe("👩🏽‍💻 é");
    expect(stripTerminalSequences(compact.at(-1)!)).toBe("FINAL ERROR");
    expect(compact.at(-1)).toContain("\x1b[31m");
    expect(compact[2]).toBe("… more output (expand)");
    expect(compact.every((row) => visibleWidth(row) <= 80)).toBe(true);
    expect(compactText(source, 1, 80, "expand")).toEqual(["… more output (expand)"]);
  });

  it("matches full wrapping for small output, including cross-line colors and narrow cells", () => {
    for (const source of [
      "",
      "\n".repeat(20),
      "first\n" + "word ".repeat(50) + "\nlast",
      "\x1b[31m界 é\n👩🏽‍💻 tail\x1b[0m"
    ]) {
      for (const width of [1, 4, 20, 80])
        expect(compactText(source, 5, width, "expand")).toEqual(
          compactRows(wrapRows(source, width), 5, width, "expand")
        );
    }
  });

  it("counts wrapped rows and preserves the first and last diagnostics", () => {
    const rows = wrapRows(`BEGIN\n${"https://example.invalid/".repeat(20)}\nFINAL ERROR`, 24);
    const compact = compactRows(rows, 5, 24, "ctrl+o to expand");
    expect(compact).toHaveLength(5);
    expect(compact[0]).toBe("BEGIN");
    expect(compact.at(-1)).toBe("FINAL ERROR");
    expect(compact[2]).toContain(`${rows.length - 4} more rows`);
    expect(compact.every((row) => visibleWidth(row) <= 24)).toBe(true);
  });

  it("fits gutters, wide graphemes, ANSI, and hints in narrow viewports", () => {
    const text = "\x1b[31m界 👩🏽‍💻 é\x1b[0m\n".repeat(12);

    for (const width of [1, 2, 4, 5, 12, 80]) {
      const compact = compactRows(wrapRows(text, bodyWidth(width)), 5, bodyWidth(width), "expand");
      const rows = renderTree([{ rows: compact }], width);
      expect(rows.length).toBeLessThanOrEqual(5);
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  });

  it("assigns endings to visible siblings and preserves rails through wrapped rows", () => {
    const items = [{ rows: ["first", "wrapped"] }, { rows: [] }, { rows: ["last", "metadata"] }];
    expect(renderTree(items, 80)).toEqual(["  ├ first", "  │ wrapped", "  └ last", "    metadata"]);
    expect(renderTree(items.slice(0, 2), 80)).toEqual(["  └ first", "    wrapped"]);
    expect(renderTree([{ rows: ["first", "notice"] }], 80, undefined, true)).toEqual([
      "  ├ first",
      "  │ notice"
    ]);
    expect(renderTreeContinuation(["parameters"], 80, undefined, true)).toEqual(["  │ parameters"]);
    expect(renderTreeContinuation(["parameters"], 80)).toEqual(["    parameters"]);
    expect(renderTree(items, 0)).toEqual([]);
  });

  it("handles empty output, blank rows, and a hint-only budget without duplicating the tail", () => {
    expect(wrapRows("", 80)).toEqual([]);
    expect(wrapRows("anything", 0)).toEqual([]);
    expect(compactRows(["one", "two"], 2, 20, "expand")).toEqual(["one", "two"]);
    expect(compactRows(["one", "two"], 1, 20, "expand")).toHaveLength(1);
    expect(compactRows(wrapRows("\n".repeat(30), 20), 5, 20, "expand")).toHaveLength(5);
  });
});
