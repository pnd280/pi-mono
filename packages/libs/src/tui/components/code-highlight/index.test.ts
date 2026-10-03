import * as codingAgent from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { highlightCodeBounded } from "./index.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof codingAgent>();

  return { ...actual, highlightCode: vi.fn(actual.highlightCode) };
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
});
