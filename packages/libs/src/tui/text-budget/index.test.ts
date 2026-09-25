import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { compactRows, compactText, textPrefix, wrapRows } from "./index.ts";

const budget = (width: number, maxRows = 5) => ({
  width,
  maxRows,
  maxCharacters: 16 * 1024,
  notice: (omitted: number | undefined) =>
    omitted === undefined ? "… more output (expand)" : `… ${omitted} more rows (expand)`
});

it("bounds prefixes without cutting graphemes or ANSI sequences", () => {
  for (const unit of ["👩🏽‍💻", "é", "\x1b[31m"]) {
    const text = `start${unit}tail`;
    for (let offset = 1; offset < unit.length; offset++)
      expect(textPrefix(text, 5 + offset)).toBe("start");
    expect(textPrefix(text, 5 + unit.length)).toBe(`start${unit}`);
  }

  expect(textPrefix("👩🏽‍💻", 0)).toBe("");
  expect(textPrefix("unchanged", Infinity)).toBe("unchanged");
});

it("does not damage styling when a combining mark follows an SGR boundary", () => {
  expect(textPrefix("a\x1b[31m\u0301b", 6)).toBe("a\x1b[31m");
  const rows = compactText("a\x1b[31m\u0301" + "x".repeat(100) + "\nEND", {
    ...budget(80, 3),
    maxCharacters: 12
  });
  expect(stripTerminalSequences(rows[0]!)).toBe("a");
  expect(stripTerminalSequences(rows.at(-1)!)).toBe("END");
});

it("bounds compact wrapping while retaining tail ANSI state, graphemes, and diagnostics", () => {
  const source = "\x1b[31mBEGIN\n" + "x".repeat(1024 * 1024) + "\n👩🏽‍💻 é\nFINAL ERROR\x1b[0m";
  const compact = compactText(source, budget(80));
  expect(compact).toHaveLength(5);
  expect(stripTerminalSequences(compact[0]!)).toBe("BEGIN");
  expect(stripTerminalSequences(compact.at(-2)!)).toBe("👩🏽‍💻 é");
  expect(stripTerminalSequences(compact.at(-1)!)).toBe("FINAL ERROR");
  expect(compact.at(-1)).toContain("\x1b[31m");
  expect(compact[2]).toBe("… more output (expand)");
  expect(compact.every((row) => visibleWidth(row) <= 80)).toBe(true);
  expect(compactText(source, budget(80, 1))).toEqual(["… more output (expand)"]);
});

it("counts wrapped rows and preserves the first and last diagnostics", () => {
  const rows = wrapRows(`BEGIN\n${"https://example.invalid/".repeat(20)}\nFINAL ERROR`, 24);
  const compact = compactRows(rows, budget(24));
  expect(compact).toHaveLength(5);
  expect(compact[0]).toBe("BEGIN");
  expect(compact.at(-1)).toBe("FINAL ERROR");
  expect(compact[2]).toContain(`${rows.length - 4} more rows`);
  expect(compact.every((row) => visibleWidth(row) <= 24)).toBe(true);
});

it("handles empty output, blank rows, and a notice-only budget without duplicating the tail", () => {
  expect(wrapRows("", 80)).toEqual([]);
  expect(wrapRows("anything", 0)).toEqual([]);
  expect(compactRows(["one", "two"], budget(20, 2))).toEqual(["one", "two"]);
  expect(compactRows(["one", "two"], budget(20, 1))).toHaveLength(1);
  expect(compactRows(wrapRows("\n".repeat(30), 20), budget(20))).toHaveLength(5);
  expect(compactText("text", budget(0))).toEqual([]);
  expect(compactText("text", budget(80, 0))).toEqual([]);
});

it("uses consumer-supplied formatting bounds and notices without measuring omitted wrapped rows", () => {
  const notices: (number | undefined)[] = [];
  const rows = compactText("BEGIN\n" + "x".repeat(1000) + "\nEND", {
    width: 20,
    maxRows: 3,
    maxCharacters: 17,
    notice: (count) => {
      notices.push(count);

      return "[truncated]";
    }
  });
  expect(rows).toEqual(["BEGIN", "[truncated]", "END"]);
  expect(notices).toEqual([undefined]);
  expect(() => compactText("text", { ...budget(80), maxCharacters: Infinity })).toThrow(RangeError);
});
