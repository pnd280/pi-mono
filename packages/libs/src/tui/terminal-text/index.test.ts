import { expect, it } from "vite-plus/test";

import {
  compactDisplayText,
  displayText,
  hasUnsafeTerminalControls,
  sliceTerminalText,
  styledOutput
} from "./index.ts";

it("checks editor source without normalizing allowed whitespace or printable Unicode", () => {
  expect(hasUnsafeTerminalControls("\ttext\r\n界😀\uFFFD")).toBe(false);
  expect(hasUnsafeTerminalControls("")).toBe(false);
  for (const code of [0, 7, 8, 11, 12, 14, 27, 31, 127, 128, 155, 159])
    expect(hasUnsafeTerminalControls(`before${String.fromCharCode(code)}after`)).toBe(true);
});

it("retains only SGR styling while normalizing whitespace and removing controls", () => {
  const text = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(styledOutput(text)).toBe("\x1b[31mred\x1b[0m\n    text");
  expect(styledOutput("\x1b[31")).toBe("");
  expect(styledOutput("\x1bPclipboard\x1b\\visible")).toBe("visible");
});

it("compacts untrusted single-line labels without leaking terminal controls", () => {
  const source = " A\x1b]52;c;YQ==\x07\r\n\t界😀  \x1b[31mB\x1b[0m\x00 ";
  expect(compactDisplayText(source)).toBe(" A 界😀 B ");
  expect(compactDisplayText("one\r\ntwo\tthree\n four")).toBe("one two three four");
  expect(compactDisplayText("  ")).toBe(" ");
});

it("slices whole graphemes and carries only visible SGR state into suffixes", () => {
  expect(sliceTerminalText("a😀b", 0, 2)).toEqual({ text: "a", leadingSgr: "" });
  expect(sliceTerminalText("a😀b", 2, 4)).toEqual({ text: "b", leadingSgr: "" });

  const source = "\x1b[31mHEAD\x1b]0;\x1b[32mhidden\x07TAIL";
  const slice = sliceTerminalText(source, source.indexOf("hidden") + 2, source.length, {
    preserveSgr: true
  });
  expect(slice).toEqual({ text: "TAIL", leadingSgr: "\x1b[31m" });
  expect(styledOutput(`${slice.leadingSgr}${slice.text}`)).toBe("\x1b[31mTAIL");
});

it("keeps complete SGR sequences at a boundary before a combining mark", () => {
  const source = "a\x1b[31m\u0301b";
  expect(sliceTerminalText(source, 0, 6)).toEqual({ text: "a\x1b[31m", leadingSgr: "" });
  expect(sliceTerminalText(source, 6, source.length, { preserveSgr: true })).toEqual({
    text: "\u0301b",
    leadingSgr: "\x1b[31m"
  });
});

it.each([
  [0, "", "🇺🇸🇨🇦"],
  [1, "", "🇨🇦"],
  [2, "", "🇨🇦"],
  [3, "", "🇨🇦"],
  [4, "🇺🇸", "🇨🇦"],
  [5, "🇺🇸", ""],
  [6, "🇺🇸", ""],
  [7, "🇺🇸", ""],
  [8, "🇺🇸🇨🇦", ""]
])("preserves adjacent flag graphemes at UTF-16 offset %i", (offset, head, tail) => {
  const source = "🇺🇸🇨🇦";
  expect(sliceTerminalText(source, 0, offset).text).toBe(head);
  expect(sliceTerminalText(source, offset, source.length).text).toBe(tail);
});

it("removes terminal commands and controls from display text", () => {
  const source = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(displayText(source)).toBe("red\n    text");
  // Unrecognized sequence payloads remain printable text, without active control bytes.
  expect(displayText("\x1bPpayload\x1b\\ok\x9b2J\x00")).toBe("Ppayload\\ok2J");
});
