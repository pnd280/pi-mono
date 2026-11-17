import * as codingAgent from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { highlightCodeBounded, highlightCodeSelection } from "./index.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof codingAgent>();

  return { ...actual, highlightCode: vi.fn(actual.highlightCode) };
});

it("does not invoke the highlighter for undetected languages or exceeded byte/line budgets", () => {
  vi.mocked(codingAgent.highlightCode).mockClear();
  for (const options of [
    { maxBytes: 3, maxLines: 3, maxLineBytes: 10, language: "typescript" },
    { maxBytes: 100, maxLines: 1, maxLineBytes: 10, language: "typescript" },
    { maxBytes: 100, maxLines: 3, maxLineBytes: 3, language: "typescript" },
    { maxBytes: 100, maxLines: 3, maxLineBytes: 10 }
  ])
    expect(highlightCodeBounded("界界\nb", options)).toBe("界界\nb");
  expect(codingAgent.highlightCode).not.toHaveBeenCalled();
});

it("marks each range of unhighlighted source without its terminal commands", () => {
  // The first range ends inside the OSC title command; limits bypass highlighting.
  const source = "ab\u001b]0;evil\u0007cd ef";
  const result = highlightCodeSelection(source, {
    maxBytes: 1,
    maxLines: 1,
    maxLineBytes: 1,
    language: "typescript",
    ranges: [
      { line: 0, start: 1, end: 5 },
      { line: 0, start: 14, end: 16 }
    ],
    mark: (text) => `[${text}]`
  });

  expect(result).toEqual({ text: "a[b]cd [ef]", hasSelection: true });
});
