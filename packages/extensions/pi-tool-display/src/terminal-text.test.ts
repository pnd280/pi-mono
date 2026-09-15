import { expect, it } from "vite-plus/test";

import { styledOutput } from "./terminal-text.ts";

it("retains only SGR styling while normalizing whitespace and removing controls", () => {
  const text = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(styledOutput(text)).toBe("\x1b[31mred\x1b[0m\n    text");
  expect(styledOutput("\x1b[31")).toBe("");
  expect(styledOutput("\x1bPclipboard\x1b\\visible")).toBe("visible");
});
