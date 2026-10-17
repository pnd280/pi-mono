import { expect, it } from "vite-plus/test";

import { displayText, styledOutput } from "./index.ts";

it("retains only SGR styling while normalizing whitespace and removing controls", () => {
  const text = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(styledOutput(text)).toBe("\x1b[31mred\x1b[0m\n    text");
  expect(styledOutput("\x1b[31")).toBe("");
  expect(styledOutput("\x1bPclipboard\x1b\\visible")).toBe("visible");
});

it("removes terminal commands and controls from display text", () => {
  const source =
    "\x1b]52;c;YQ==\x07\x1b[2Jbefore\x1b[?25lordinary\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(displayText(source)).toBe("beforeordinaryred\n    text");
  // Unrecognized sequence payloads remain printable text, without active control bytes.
  expect(displayText("\x1bPpayload\x1b\\ok\x9b2J\x00")).toBe("Ppayload\\ok2J");
});
