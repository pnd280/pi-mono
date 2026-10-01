import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { createToolDisplayRenderers as createTranscriptRenderers } from "../../rendering/cards.ts";
import { TranscriptCoordinator } from "../../transcript/coordinator.ts";
import { selectiveReadDisplayAdapter } from "./index.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};

beforeAll(() => initTheme("dark", false));

it.each([
  [{ path: "example.txt", startLine: "1" }, "Read example.txt"],
  [{ path: "example.txt", limit: "3" }, "Called read("],
  [{ path: "example.txt", selection: { startLine: 1, extra: null } }, "Called read("]
])("specializes interpretable retained read arguments: %j", (args, heading) => {
  const coordinator = new TranscriptCoordinator("read-arguments", { cwd: "/project" });
  const before = structuredClone(args);

  try {
    const call = coordinator.add(
      { messageTimestamp: 1, contentIndex: 0, toolCallId: "read" },
      "read",
      args,
      selectiveReadDisplayAdapter,
      "historical"
    );
    const result: AgentToolResult<unknown> = {
      content: [{ type: "text", text: "source" }],
      details: undefined
    };
    coordinator.result(call, result, "success");
    const context = {
      args,
      state: {},
      toolCallId: "read",
      cwd: "/project",
      lastComponent: undefined,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
      invalidate() {}
    };
    const renderers = createTranscriptRenderers("read", selectiveReadDisplayAdapter, {
      binding: { call, coordinator }
    });
    expect(renderers.renderCall(args, theme, context).render(120).join("\n")).toContain(heading);
    expect(args).toEqual(before);
  } finally {
    coordinator.dispose();
  }
});

it("renders selected source once through public cards, hides compact text, and retains diagnostics", () => {
  const args = {
    path: "example.txt",
    startLine: "1",
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
  const selectedTheme = {
    ...theme,
    bg: (color: string, text: string) =>
      color === "searchMatchBg" ? `\x1b[43m${text}\x1b[49m` : text
  };

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
    const call = renderers.renderCall(args, selectedTheme, context);
    const view = renderers.renderResult(result, context, selectedTheme, context);
    const output = [...call.render(100), ...view.render(100)].join("\n");
    const plain = stripTerminalSequences(output);
    expect(plain).not.toContain("Selected source preview:");
    expect(plain).toContain("selection 9:2-9:3");

    if (expanded) {
      expect(plain).toContain("context");
      expect(plain).toContain("界tail");
      expect(plain.split("界tail")).toHaveLength(2);
      expect(output).toContain("    \x1b[43m界\x1b[49mtail");
      expect(output.split("\x1b[43m")).toHaveLength(2);
    } else {
      expect(plain).not.toContain("context");
      expect(output).not.toContain("\x1b[43m");
    }

    expect(plain).toContain("9 more lines");
  }

  expect(result).toEqual(before);
});
