import * as codingAgent from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { highlightCodeBounded } from "./index.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof codingAgent>();

  return { ...actual, highlightCode: vi.fn(actual.highlightCode) };
});

it("uses Pi language detection and preserves the source content", () => {
  const source = "const answer = 42;";
  const result = highlightCodeBounded(source, {
    path: "a.ts",
    maxBytes: 100,
    maxLines: 10,
    maxLineBytes: 100
  });
  expect(stripTerminalSequences(result)).toBe(source);
  expect(codingAgent.highlightCode).toHaveBeenCalledWith(source, "typescript");
});

it("does not invoke the highlighter for unknown languages or exceeded byte/line budgets", () => {
  vi.mocked(codingAgent.highlightCode).mockClear();
  for (const options of [
    { maxBytes: 3, maxLines: 3, maxLineBytes: 10, language: "typescript" },
    { maxBytes: 100, maxLines: 1, maxLineBytes: 10, language: "typescript" },
    { maxBytes: 100, maxLines: 3, maxLineBytes: 3, language: "typescript" },
    { maxBytes: 100, maxLines: 3, maxLineBytes: 10 }
  ])
    expect(highlightCodeBounded("界界\nb", options)).toBe("界界\nb");
  expect(codingAgent.highlightCode).not.toHaveBeenCalled();
  expect(() => highlightCodeBounded("a", { maxBytes: -1, maxLines: 1, maxLineBytes: 1 })).toThrow(
    RangeError
  );
});
