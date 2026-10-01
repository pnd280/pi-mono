import { fauxToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import {
  createReadToolDefinition,
  initTheme,
  truncateHead,
  type Theme
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { selectionSchema } from "@pi-mono/utils/source-selection";
import { beforeAll, expect, it } from "vite-plus/test";

import { appendPreview, type ReadResult } from "./result.ts";
import {
  createSelectiveReadTool,
  type SelectiveReadParams,
  type SelectiveReadTool
} from "./tool.ts";

const themeMethods: Pick<Theme, "fg" | "bg" | "bold" | "getBgAnsi"> = {
  fg: (_color, text) => text,
  bg: (_color, text) => `\x1b[43m${text}\x1b[49m`,
  bold: (text) => text,
  getBgAnsi: () => "\x1b[49m"
};
// The renderer uses only these theme methods; syntax coloring is owned by the shared helper.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const theme = themeMethods as Theme;

beforeAll(() => initTheme("dark", false));

function context(
  args: SelectiveReadParams
): Parameters<NonNullable<SelectiveReadTool["renderCall"]>>[2] {
  return {
    args,
    toolCallId: "render",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd: "/project",
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: true,
    showImages: true,
    isError: false
  };
}

it.each([
  { window: { offset: 2.8, limit: 1.4 }, label: "lines 2-3" },
  { window: { offset: 2.8, limit: 0.4 }, label: "lines 2-2" },
  { window: { limit: 0 }, label: "from line 1 · limit 0" }
])(
  "labels the native read window without rounding its limit separately: %j",
  ({ window, label }) => {
    const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
    const args = { path: "example.txt", ...window };
    const output = tool.renderCall(args, theme, context(args)).render(80).join("\n");
    expect(stripTerminalSequences(output)).toContain(label);
  }
);

it("renders context once and highlights the selected code point after tab expansion", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const args = { path: "example.txt", selection: { startLine: 2, startColumn: 2, endColumn: 3 } };
  const native: ReadResult = {
    content: [{ type: "text", text: "context\n\t界tail\nend" }],
    details: undefined
  };
  const result = appendPreview(native, args, selectionSchema.parse(args.selection));
  const view = tool.renderResult(
    result,
    { expanded: true, isPartial: false },
    theme,
    context(args)
  );
  const output = view.render(80).join("\n");
  expect(output).toContain("\x1b[43m界\x1b[49m");
  expect(stripTerminalSequences(output)).toContain("界tail");
  expect(stripTerminalSequences(output)).toContain("context");
  expect(output).not.toContain("Selected source preview");
});

it("highlights retained arguments whose optional coordinates Pi normalizes from null", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const raw = {
    path: "example.txt",
    selection: { startLine: 1, startColumn: null, endLine: null, endColumn: null }
  };
  const args = { path: "example.txt", selection: { startLine: 1 } };
  expect(validateToolArguments(tool, fauxToolCall("read", raw))).toEqual(args);
  const result = appendPreview(
    { content: [{ type: "text", text: "selected\ncontext" }], details: undefined },
    args,
    selectionSchema.parse(args.selection)
  );
  const output = tool
    .renderResult(result, { expanded: true, isPartial: false }, theme, {
      ...context(args),
      args: raw
    })
    .render(80)
    .join("\n");
  expect(output).toContain("\x1b[43mselected\x1b[49m");
  expect(raw.selection.startColumn).toBeNull();
});

it("keeps source omissions and an absent-selection warning visible even while collapsed", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const args = { path: "example.txt", limit: 1, selection: { startLine: 3 } };
  const result: ReadResult = {
    content: [
      { type: "text", text: "source\n\n[9 more lines in file. Use offset=2 to continue.]" }
    ],
    details: undefined
  };
  const output = tool
    .renderResult(result, { expanded: false, isPartial: false }, theme, context(args))
    .render(100)
    .join("\n");
  expect(output).toContain("to expand");
  expect(output).toContain("9 more lines");
  expect(output).toMatch(/selected text.*read window/i);
  expect(output).not.toContain("\x1b[43m");
});

it.each([
  { window: {}, details: undefined, notice: "", loaded: true },
  {
    window: { offset: 2, limit: 1 },
    details: undefined,
    notice: "[9 more lines in file. Use offset=3 to continue.]",
    loaded: false
  },
  {
    window: {},
    details: { truncation: truncateHead("hidden source") },
    notice: "[Showing lines 1-1 of 10. Use offset=2 to continue.]",
    loaded: true
  }
])(
  "keeps unselected collapsed summaries and notices without revealing the source: %j",
  (scenario) => {
    const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
    const args = { path: "example.txt", ...scenario.window };
    const result: ReadResult = {
      content: [
        {
          type: "text",
          text: "hidden source\u001b[31m" + (scenario.notice ? `\n\n${scenario.notice}` : "")
        }
      ],
      details: scenario.details
    };
    const output = tool
      .renderResult(result, { expanded: false, isPartial: false }, theme, context(args))
      .render(80)
      .join("\n");
    expect(output).toContain("to expand");
    expect(output.includes("loaded 1 line")).toBe(scenario.loaded);
    if (scenario.notice) expect(output).toContain(scenario.notice);
    expect(output).not.toContain("hidden source");
    expect(output).not.toContain("\u001b[31m");
    expect(output).not.toContain("No selected text");
  }
);

it("recovers malformed provenance and optional display fields without hiding retained source", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const args = { path: "example.txt", selection: { startLine: 2 } };
  const result: ReadResult = {
    content: [
      { type: "text", text: "source" },
      { type: "text", text: "retained unowned text" }
    ],
    details: { selectiveRead: { sourceBlocks: 9 } }
  };
  const output = tool
    .renderResult(result, { expanded: true, isPartial: false }, theme, {
      ...context(args),
      // @ts-expect-error Retained display arguments can be malformed even after execution.
      args: { ...args, offset: "invalid", limit: "invalid" }
    })
    .render(80)
    .join("\n");
  expect(stripTerminalSequences(output)).toContain("source");
  expect(stripTerminalSequences(output)).toContain("retained unowned text");
  expect(output).toContain("\x1b[43mretained unowned text\x1b[49m");
});

it("delegates image, error, and partial output to the native renderer without previews", () => {
  const base = createReadToolDefinition("/project");
  const tool = createSelectiveReadTool(base);
  const args = { path: "example.txt", selection: { startLine: 1 } };
  const text: ReadResult = { content: [{ type: "text", text: "source" }], details: undefined };
  const augmented = appendPreview(text, args, selectionSchema.parse(args.selection));
  const image: ReadResult = {
    content: [{ type: "image", data: "AA==", mimeType: "image/png" }],
    details: undefined
  };

  for (const scenario of [
    { result: augmented, isError: true, isPartial: false, native: text },
    { result: augmented, isError: false, isPartial: true, native: text },
    { result: image, isError: false, isPartial: false, native: image }
  ]) {
    const ctx = {
      ...context(args),
      isError: scenario.isError,
      lastComponent: { render: () => [], invalidate() {} }
    };
    const options = { expanded: true, isPartial: scenario.isPartial };
    const expected = base.renderResult!(scenario.native, options, theme, {
      ...ctx,
      lastComponent: undefined
    }).render(80);
    expect(tool.renderResult(scenario.result, options, theme, ctx).render(80)).toEqual(expected);
  }
});
