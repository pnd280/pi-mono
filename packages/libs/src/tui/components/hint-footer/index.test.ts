import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { renderHintFooter, type HintFooterOptions } from "./index.ts";

const options = {
  width: 22,
  maxRows: 3,
  hints: ["Enter choose", "Esc cancel", "界 next"],
  padding: "  ",
  separator: " · ",
  style: (text: string) => text
} satisfies HintFooterOptions;

it("packs hints by terminal width and respects the caller's row budget", () => {
  const result = renderHintFooter(options);
  expect(result.rows).toHaveLength(2);
  expect(result.rows.join("\n")).toContain("Esc cancel · 界 next");
  expect(result.rows.every((row) => visibleWidth(row) <= options.width)).toBe(true);
  expect(renderHintFooter({ ...options, maxRows: 1 }).rows).toHaveLength(1);
  expect(renderHintFooter({ ...options, width: 0 }).rows).toEqual([]);
});

it("replaces the reserved hint rows with bounded feedback and reports overflow without side effects", () => {
  const original = renderHintFooter(options);
  const result = renderHintFooter({
    ...options,
    message: {
      text: "long message ".repeat(20),
      style: (text) => `\x1b[31m${text}\x1b[0m`,
      overflowText: "More in notice"
    }
  });
  expect(result.rows).toHaveLength(original.rows.length);
  expect(result.messageOverflow).toBe(true);
  expect(result.rows.at(-1)).toContain("More in notice");
  expect(result.rows.every((row) => visibleWidth(row) <= options.width)).toBe(true);
  expect(
    renderHintFooter({
      ...options,
      maxRows: 0,
      message: { text: "a", style: (text) => text, overflowText: "more" }
    })
  ).toEqual({ rows: [], messageOverflow: true });
});
