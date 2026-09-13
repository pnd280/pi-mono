import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vite-plus/test";

import {
  bodyWidth,
  compactRows,
  displayText,
  renderTree,
  renderTreeContinuation,
  styledOutput,
  wrapRows
} from "./layout.ts";

describe("display row budgets", () => {
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

  it("removes terminal commands while normalizing CRLF, tabs, and control bytes", () => {
    const text = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
    expect(displayText(text)).toBe("red\n    text");
    expect(stripTerminalSequences(displayText(text))).toBe(displayText(text));
    expect(styledOutput(text)).toBe("\x1b[31mred\x1b[0m\n    text");
    expect(styledOutput("\x1b[31")).toBe("");
    expect(styledOutput("\x1bPclipboard\x1b\\visible")).toBe("visible");
  });
});
