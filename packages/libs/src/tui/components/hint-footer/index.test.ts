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
  expect(result).toHaveLength(2);
  expect(result.join("\n")).toContain("Esc cancel · 界 next");
  expect(result.every((row) => visibleWidth(row) <= options.width)).toBe(true);
  expect(renderHintFooter({ ...options, maxRows: 1 })).toHaveLength(1);
  expect(renderHintFooter({ ...options, width: 0 })).toEqual([]);
});

it("replaces the reserved hint rows with bounded feedback and a final-row overflow fallback", () => {
  const original = renderHintFooter(options);
  const result = renderHintFooter({
    ...options,
    message: {
      text: "long message ".repeat(20),
      style: (text) => `\x1b[31m${text}\x1b[0m`,
      overflowText: "More in notice"
    }
  });
  expect(result).toHaveLength(original.length);
  expect(result.at(-1)).toContain("More in notice");
  expect(result.every((row) => visibleWidth(row) <= options.width)).toBe(true);
  expect(
    renderHintFooter({
      ...options,
      maxRows: 0,
      message: { text: "a", style: (text) => text, overflowText: "more" }
    })
  ).toEqual([]);
});

it("keeps the reserved height for short feedback and respects ANSI-aware width and padding", () => {
  const result = renderHintFooter({
    ...options,
    message: {
      text: "\x1b[31m界 feedback\x1b[0m",
      style: (text) => text,
      overflowText: "more"
    }
  });
  expect(result).toEqual(["  \x1b[31m界 feedback\x1b[0m", ""]);
  expect(result.every((row) => visibleWidth(row) <= options.width)).toBe(true);
});
