import { createReadToolDefinition, initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { selectionSchema } from "@pi-mono/utils/source-selection";
import { beforeAll, expect, it, vi } from "vite-plus/test";

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

it("renders source once, marks raw-code-point selections after tab expansion, and bounds terminal rows", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const args = { path: "example.txt", selection: { startLine: 2, startColumn: 2, endColumn: 3 } };
  const native: ReadResult = {
    content: [{ type: "text", text: "context\n\t界tail\nend\u001b]0;hidden-title\u0007" }],
    details: undefined
  };
  const result = appendPreview(native, args, selectionSchema.parse(args.selection));
  const view = tool.renderResult!(
    result,
    { expanded: true, isPartial: false },
    theme,
    context(args)
  );
  const output = view.render(80).join("\n");
  expect(output).toContain("\x1b[43m界\x1b[49m");
  expect(stripTerminalSequences(output)).toContain("    界tail");
  expect(stripTerminalSequences(output)).toContain("context");
  expect(output).not.toContain("Selected source preview");
  expect(output).not.toContain("hidden-title");

  for (const width of [2, 5, 20]) {
    expect(view.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
  }
});

it("does not highlight visible characters when the selection falls inside a terminal sequence", () => {
  const tool = createSelectiveReadTool(createReadToolDefinition("/project"));
  const args = { path: "example.txt", selection: { startLine: 1, startColumn: 6, endColumn: 9 } };
  const result: ReadResult = {
    content: [{ type: "text", text: "A\u001b]0;hidden\u0007B" }],
    details: undefined
  };
  const output = tool.renderResult!(
    result,
    { expanded: true, isPartial: false },
    theme,
    context(args)
  )
    .render(100)
    .join("\n");
  expect(output).toContain("AB");
  expect(output).not.toContain("\u001b[43m");
  expect(output).toContain("No selected text is visible");
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
  const output = tool.renderResult!(
    result,
    { expanded: false, isPartial: false },
    theme,
    context(args)
  )
    .render(100)
    .join("\n");
  expect(output).toContain("to expand");
  expect(output).toContain("9 more lines");
  expect(output).toContain("No selected text is visible");
  expect(output).not.toContain("\x1b[43m");
});

it("delegates images, errors, and partial results without passing previews or incompatible cached components", () => {
  const base = createReadToolDefinition("/project");
  const nativeView = new Text("native", 0, 0);
  const render = vi.fn(() => nativeView);
  base.renderResult = render;
  const tool = createSelectiveReadTool(base);
  const args = { path: "example.txt", selection: { startLine: 1 } };
  const text: ReadResult = { content: [{ type: "text", text: "source" }], details: undefined };
  const augmented = appendPreview(text, args, selectionSchema.parse(args.selection));
  const image: ReadResult = {
    content: [{ type: "image", data: "AA==", mimeType: "image/png" }],
    details: undefined
  };

  for (const scenario of [
    { result: augmented, isError: true, isPartial: false, source: text.content },
    { result: augmented, isError: false, isPartial: true, source: text.content },
    { result: image, isError: false, isPartial: false, source: image.content }
  ]) {
    const ctx = {
      ...context(args),
      isError: scenario.isError,
      lastComponent: { render: () => [], invalidate() {} }
    };
    expect(
      tool.renderResult!(
        scenario.result,
        { expanded: true, isPartial: scenario.isPartial },
        theme,
        ctx
      )
    ).toBe(nativeView);
    expect(render).toHaveBeenLastCalledWith(
      { ...scenario.result, content: scenario.source },
      { expanded: true, isPartial: scenario.isPartial },
      theme,
      { ...ctx, lastComponent: undefined }
    );
  }
});
