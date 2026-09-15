import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { displayText } from "./terminal-text.ts";

it("removes terminal commands and controls without modifying the source", () => {
  const source = "\x1b]52;c;YQ==\x07\x1b[2J\x1b[31mred\x1b[0m\r\n\ttext\x00\x07";
  expect(displayText(source)).toBe("red\n    text");
  expect(stripTerminalSequences(displayText(source))).toBe(displayText(source));
  expect(source).toContain("\x1b]52;");
  // Unrecognized sequence payloads remain printable text, without active control bytes.
  expect(displayText("\x1bPpayload\x1b\\ok\x9b2J\x00")).toBe("Ppayload\\ok2J");
});
