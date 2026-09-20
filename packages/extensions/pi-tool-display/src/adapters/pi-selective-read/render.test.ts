import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { selectiveReadDisplayAdapter } from "./index.ts";

beforeAll(() => initTheme("dark", false));

it("renders selected source once through public cards, hides compact text, and retains diagnostics", () => {
  const theme = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => `\x1b[43m${text}\x1b[49m`,
    getBgAnsi: () => "",
    bold: (text: string) => text
  };
  const args = {
    path: "example.txt",
    offset: 8,
    limit: 2,
    selection: { startLine: 9, startColumn: 2, endColumn: 3 }
  };
  const result: AgentToolResult<unknown> = {
    content: [
      {
        type: "text",
        text: "context\n\t界tail\n\n[9 more lines in file. Use offset=10 to continue.]"
      },
      { type: "text", text: "Selected source preview:\n界" }
    ],
    details: { selectiveRead: { sourceBlocks: 1 } }
  };
  const before = structuredClone(result);

  for (const expanded of [false, true]) {
    const context = {
      args,
      state: {},
      toolCallId: "selected",
      cwd: "/project",
      lastComponent: undefined,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded,
      showImages: false,
      isError: false,
      invalidate() {}
    };
    const renderers = createToolDisplayRenderers("read", selectiveReadDisplayAdapter);
    const call = renderers.renderCall(args, theme, context);
    const view = renderers.renderResult(result, context, theme, context);
    const output = [...call.render(100), ...view.render(100)].join("\n");
    const plain = stripTerminalSequences(output);
    expect(plain).not.toContain("Selected source preview:");
    expect(plain).toContain("selection 9:2-9:3");

    if (expanded) {
      expect(output).toContain("\x1b[43m界\x1b[49m");
      expect(plain).toContain("context");
      expect(plain).toContain("9 more lines");
      for (const width of [12, 40])
        expect(view.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    } else {
      expect(plain).not.toContain("context");
      expect(plain).toContain("9 more lines");
      expect(output).not.toContain("\x1b[43m");
    }
  }

  expect(result).toEqual(before);
});
