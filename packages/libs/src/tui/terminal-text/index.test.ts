import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { displayText, hasUnsafeTerminalControls, styledOutput } from "./index.ts";

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

it("removes terminal commands and controls without modifying the source", () => {
  const source = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(displayText(source)).toBe("red\n    text");
  expect(stripTerminalSequences(displayText(source))).toBe(displayText(source));
  expect(source).toContain("\x1b]52;");
  // Unrecognized sequence payloads remain printable text, without active control bytes.
  expect(displayText("\x1bPpayload\x1b\\ok\x9b2J\x00")).toBe("Ppayload\\ok2J");
});
