import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";

import { createToolDisplayRenderers, type ToolDisplayRenderers } from "./renderers.ts";

type Context = Parameters<ToolDisplayRenderers["renderCall"]>[2];
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
function context(overrides: Partial<Context> = {}): Context {
  return {
    args: {},
    state: {},
    toolCallId: "call-1",
    cwd: "/tmp",
    lastComponent: undefined,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    invalidate: () => {},
    ...overrides,
  };
}
function result(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: undefined };
}
function body(name: string, value: AgentToolResult<unknown>, current = context()) {
  return createToolDisplayRenderers(name).renderResult(value, current, theme, current);
}

beforeAll(() => {
  initTheme("dark", false);
});

describe("tool display renderers", () => {
  it("keeps failed reads visible while compact successful reads disclose retained output and limits", () => {
    const failed = body("read", result("Permission denied"), context({ isError: true }))
      .render(80)
      .join("\n");
    expect(failed).toContain("Permission denied");
    const successful = body("read", {
      ...result("content\ncontent"),
      details: { truncation: { truncated: true } },
    })
      .render(80)
      .join("\n");
    expect(successful).toContain("2 lines returned");
    expect(successful).toContain("truncated");
    expect(successful).not.toContain("content");
  });

  it("replaces streamed previews with the final payload and isolates overlapping calls", () => {
    const renderer = createToolDisplayRenderers("bash");
    const first = context({ isPartial: true });
    const pending = renderer.renderResult(result("partial-only"), first, theme, first);
    expect(pending.render(80).join("\n")).toContain("partial-only");
    const sibling = body("bash", result("sibling output"), context({ toolCallId: "call-2" }));
    const final = context({ lastComponent: pending });
    const complete = renderer.renderResult(result("authoritative final"), final, theme, final);
    expect(complete.render(80).join("\n")).toContain("authoritative final");
    expect(complete.render(80).join("\n")).not.toContain("partial-only");
    expect(sibling.render(80).join("\n")).toContain("sibling output");
  });

  it("expands all retained output and reflows without altering model-visible data", () => {
    const value = result(Array.from({ length: 30 }, (_, index) => `row ${index}`).join("\n"));
    const original = structuredClone(value);
    expect(body("bash", value).render(80)).toHaveLength(5);
    const expanded = body("bash", value, context({ expanded: true }));
    expect(expanded.render(80)).toHaveLength(30);
    expect(expanded.render(10).every((row) => visibleWidth(row) <= 10)).toBe(true);
    expect(value).toEqual(original);
  });

  it("renders completion and failure on replay without a preceding call or event", () => {
    const renderer = createToolDisplayRenderers("bash");
    expect(
      renderer
        .renderCall(
          { command: "false" },
          theme,
          context({ isError: true, executionStarted: false }),
        )
        .render(80)
        .join("\n"),
    ).toContain("Failed bash");
    expect(
      renderer
        .renderCall(
          {},
          theme,
          context({ isPartial: true, argsComplete: false, executionStarted: false }),
        )
        .render(80)
        .join("\n"),
    ).toContain("Preparing");
    expect(
      renderer
        .renderCall({ command: "true" }, theme, context({ executionStarted: false }))
        .render(80)
        .join("\n"),
    ).toContain("Ran true");
  });

  it("retains numbered diffs with a separate compact budget and expanded inspection", () => {
    const diff = Array.from({ length: 20 }, (_, index) => `+${index + 1} added ${index}`).join(
      "\n",
    );
    const value = { ...result("Successfully edited example.txt"), details: { diff } };
    const compact = body("edit", value).render(80).map(stripTerminalSequences).join("\n");
    expect(compact).toContain("+20 -0");
    expect(compact).toContain("+1 added 0");
    expect(compact).toContain("+20 added 19");
    expect(compact).toContain("more rows");
    expect(
      body("edit", value, context({ expanded: true }))
        .render(80)
        .map(stripTerminalSequences)
        .join("\n"),
    ).toContain("+10 added 9");
  });

  it("rebuilds theme-dependent spans after invalidation and handles narrow command headers", () => {
    let color = "\x1b[31m";
    const changingTheme = {
      ...theme,
      fg: (_token: string, text: string) => `${color}${text}\x1b[0m`,
    };
    const renderer = createToolDisplayRenderers("bash");
    const current = context({ expanded: true });
    const component = renderer.renderCall({ command: "界".repeat(50) }, changingTheme, current);
    const first = component.render(80);
    color = "\x1b[32m";
    component.invalidate();
    expect(component.render(80)).not.toEqual(first);
    for (const width of [1, 4, 8, 20]) {
      expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  });
});
