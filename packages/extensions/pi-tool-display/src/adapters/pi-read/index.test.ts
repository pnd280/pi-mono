import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import type { ResultTextContext } from "../../contracts.ts";
import { selectiveReadDisplayAdapter as adapter } from "./index.ts";

function result(text = "source", preview?: string): AgentToolResult<unknown> {
  return {
    content: [text, ...(preview === undefined ? [] : [preview])].map((text) => ({
      type: "text",
      text
    })),
    details: preview === undefined ? undefined : { selectiveRead: { sourceBlocks: 1 } }
  };
}

function context(
  value: AgentToolResult<unknown>,
  overrides: Partial<ResultTextContext> = {}
): ResultTextContext {
  return {
    result: value,
    contentIndex: 0,
    isError: false,
    isPartial: false,
    isCancelled: false,
    expanded: true,
    ...overrides
  };
}

it("normalizes display arguments without mutating retained input", () => {
  const args = {
    path: "a.ts",
    offset: null,
    limit: null,
    selection: { startLine: 2, startColumn: null, endLine: null, endColumn: null }
  };
  const before = structuredClone(args);
  const text = "first\nsecond\nthird";
  const value = result(text, "preview");

  expect(adapter.supports?.(args, value)).toBe(true);
  adapter.invocation?.(args);
  adapter.exploration?.(args, value);
  adapter.textParts?.(text, args, context(value));
  expect(args).toEqual(before);
});

it("keeps multi-block selected-read results unchanged during interpretation", () => {
  const first = "alpha\n";
  const second = "\t😀界tail\nnext\n\n[3 more lines in file. Use offset=14 to continue.]";
  const value: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: first },
      { type: "text", text: second },
      { type: "text", text: "model preview" }
    ],
    details: { selectiveRead: { sourceBlocks: 2 }, truncation: { outputLines: 4, truncated: true } }
  };
  const before = structuredClone(value);
  const args = {
    path: "a.ts",
    offset: 10,
    limit: 1,
    selection: { startLine: 12, startColumn: 2, endLine: 20 }
  };

  expect(adapter.supports?.(args, value)).toBe(true);
  adapter.textParts?.(first, args, context(value));
  adapter.textParts?.(second, args, context(value, { contentIndex: 1 }));
  adapter.textParts?.("model preview", args, context(value, { contentIndex: 2 }));
  expect(value).toEqual(before);
});
