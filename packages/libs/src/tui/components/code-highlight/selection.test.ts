import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { highlightCodeSelection } from "./index.ts";

const options = {
  maxBytes: 0,
  maxLines: 10,
  maxLineBytes: 100,
  mark: (text: string) => `\x1b[43m${text}\x1b[49m`
};

it("marks raw UTF-16 ranges after tab expansion and preserves wide glyphs and whole graphemes", () => {
  const source = "\t😀界e\u0301tail\ncontext";
  const result = highlightCodeSelection(source, {
    ...options,
    ranges: [{ line: 0, start: 1, end: 6 }]
  });
  expect(result.hasSelection).toBe(true);
  expect(result.text).toContain("    \x1b[43m😀界e\u0301\x1b[49mtail");
  expect(stripTerminalSequences(result.text)).toBe("    😀界e\u0301tail\ncontext");
});

it("never exposes escape-sequence fragments at either endpoint", () => {
  const source = "A\x1b]0;hidden\x07B";

  for (const [start, end] of [
    [5, 8],
    [0, 8],
    [5, source.length]
  ]) {
    const result = highlightCodeSelection(source, {
      ...options,
      ranges: [{ line: 0, start: start!, end: end! }]
    });
    expect(stripTerminalSequences(result.text)).toBe("AB");
    expect(result.text).not.toContain("hidden");
    expect(result.hasSelection).toBe(start === 0 || end === source.length);
  }
});

it("ignores empty or absent ranges and leaves contextual lines unmarked", () => {
  expect(
    highlightCodeSelection("source\ncontext", {
      ...options,
      ranges: [
        { line: 0, start: 2, end: 2 },
        { line: 3, start: 0, end: 9 }
      ]
    })
  ).toEqual({ text: "source\ncontext", hasSelection: false });
});
