import {
  initTheme,
  ToolExecutionComponent,
  type AgentToolResult
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { genericAdapter, nativeAdapter, officialFffAdapter, type McpFacts } from "./adapters.ts";
import { OutputBuffer, LIVE_OUTPUT_BYTES } from "./output-buffer.ts";
import { createToolDisplayRenderers, type ToolDisplayRenderers } from "./renderers.ts";
import { TranscriptCoordinator } from "./transcript-coordinator.ts";

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
    ...overrides
  };
}
function result(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: undefined };
}
function body(name: string, value: AgentToolResult<unknown>, current = context()) {
  return createToolDisplayRenderers(name, nativeAdapter(name)).renderResult(
    value,
    current,
    theme,
    current
  );
}

beforeAll(() => {
  initTheme("dark", false);
});

function semanticTheme() {
  const colors: Record<string, string> = {
    accent: "\x1b[36m",
    toolTitle: "\x1b[35m",
    dim: "\x1b[90m",
    error: "\x1b[31m",
    warning: "\x1b[33m",
    toolOutput: "\x1b[37m"
  };
  return {
    ...theme,
    fg: (token: string, text: string) => `${colors[token] ?? "\x1b[39m"}${text}\x1b[39m`
  };
}
describe("tool display renderers", () => {
  it("preserves accented group actions separately from card titles and dim structure", () => {
    const themed = semanticTheme();
    const coordinator = new TranscriptCoordinator("group-colors");
    try {
      const calls = (
        [
          ["read", { path: "example.ts" }],
          ["grep", { pattern: "value", path: "src" }],
          ["ls", { path: "src" }]
        ] as const
      ).map(([name, args], index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: `group-${index}` },
          name,
          args,
          nativeAdapter(name)!,
          "historical"
        );
        coordinator.result(call, result("retained output"), "success");
        return call;
      });
      const first = calls[0]!;
      const renderer = createToolDisplayRenderers(first.name, first.adapter, {
        binding: { call: first, coordinator }
      });
      for (const width of [38, 100]) {
        const rows = renderer.renderCall(first.args, themed, context()).render(width).join("\n");
        for (const label of ["Read", "Search", "List"])
          expect(rows).toContain(themed.fg("accent", label));
        expect(rows).toContain(themed.fg("toolTitle", "Explored"));
        expect(rows).toContain(themed.fg("dim", "  └ "));
      }
      coordinator.expand(first, true);
      expect(renderer.renderCall(first.args, themed, context()).render(80).join("\n")).toContain(
        themed.fg("toolTitle", "Read")
      );
    } finally {
      coordinator.dispose();
    }
  });
  it("dims native empty-output prose and separates failure status from process output", () => {
    const themed = semanticTheme();
    const render = (name: string, text: string, isError = false, specialized = true) => {
      const current = context({ isError, expanded: true });
      return createToolDisplayRenderers(name, specialized ? nativeAdapter(name) : undefined)
        .renderResult(result(text), current, themed, current)
        .render(120)
        .join("\n");
    };
    for (const name of ["bash", "powershell"]) {
      expect(render(name, "(no output)")).toContain(themed.fg("dim", "(no output)"));
      const failed = render(name, "(no output)\n\nCommand exited with code 42", true);
      expect(failed).toContain(themed.fg("dim", "(no output)"));
      expect(failed).toContain(themed.fg("error", "Command exited with code 42"));
      expect(render(name, "stdout\n\nCommand aborted", true)).toContain(
        themed.fg("warning", "Command aborted")
      );
      expect(render(name, "stdout\n\nCommand timed out after 5 seconds", true)).toContain(
        themed.fg("error", "Command timed out after 5 seconds")
      );
      expect(render(name, "literal (no output)\nCommand exited with code 42")).not.toContain(
        themed.fg("error", "Command exited with code 42")
      );
      expect(render(name, "(no output)", false, false)).not.toContain(
        themed.fg("dim", "(no output)")
      );
    }
    expect(render("read", "Permission denied", true)).toContain(
      themed.fg("error", "Permission denied")
    );
  });
  it("colors inserted live/saved budget notices without recoloring identical process text", () => {
    const marker = "… 81 lines omitted …";
    const buffer = new OutputBuffer();
    buffer.append(Buffer.from(marker + " " + "x".repeat(LIVE_OUTPUT_BYTES) + "\n"));
    for (let line = 0; line < 180; line++) buffer.append(Buffer.from(`line ${line}\n`));
    const preview = buffer.snapshot();
    const coordinator = new TranscriptCoordinator("output-colors");
    try {
      const adapter = nativeAdapter("bash")!;
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "output" },
        "bash",
        { command: "fixture" },
        adapter,
        "live",
        true
      );
      const themed = semanticTheme();
      const renderer = createToolDisplayRenderers("bash", adapter, {
        binding: { call, coordinator }
      });
      coordinator.preview(call, preview);
      for (const saved of [false, true]) {
        if (saved) {
          coordinator.result(call, result("retained result"), "success");
          call.savedOutput = { path: "saved-output", ...preview };
        }
        const rows = renderer
          .renderResult(result("partial result"), context(), themed, context())
          .render(120)
          .join("\n");
        expect(rows.split(themed.fg("warning", marker))).toHaveLength(2);
        expect(rows).toContain(`\x1b[37m${marker}`);
        expect(rows).not.toContain("partial result");
      }
    } finally {
      coordinator.dispose();
    }
  });
  it("keeps published failure diagnostics visible when expanded saved output is available", () => {
    const coordinator = new TranscriptCoordinator("saved-failure");
    try {
      const adapter = nativeAdapter("bash")!;
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "failed-shell" },
        "bash",
        { command: "fixture" },
        adapter,
        "historical",
        true
      );
      const renderer = createToolDisplayRenderers("bash", adapter, {
        binding: { call, coordinator }
      });
      for (const diagnostic of ["Command exited with code 7", "Rejected by result middleware"]) {
        const published = result(diagnostic);
        coordinator.result(call, published, "failure");
        call.savedOutput = { path: "saved-output", text: "complete process output" };
        const current = context({ args: call.args, expanded: true, isError: true });
        const rows = renderer
          .renderResult(published, current, theme, current)
          .render(100)
          .join("\n");
        expect(rows).toContain("complete process output");
        expect(rows).toContain(diagnostic);
      }
    } finally {
      coordinator.dispose();
    }
  });
  it("hides known parameter details by default without hiding summaries or expanded output", () => {
    for (const [name, args, summary, key] of [
      ["read", { path: "example.txt", limit: 10 }, "example.txt", '"limit"'],
      ["write", { path: "example.txt", content: "proposed content" }, "example.txt", '"content"'],
      ["grep", { pattern: "needle", path: "src" }, "needle in src", '"pattern"']
    ] as const) {
      const renderer = createToolDisplayRenderers(name, nativeAdapter(name));
      const current = context({ args, expanded: true });
      const heading = renderer.renderCall(args, theme, current).render(80).join("\n");
      expect(heading).toContain(summary);
      expect(heading).not.toContain(key);
      const visible = createToolDisplayRenderers(name, nativeAdapter(name), {
        showParameters: true
      });
      expect(visible.renderCall(args, theme, current).render(80).join("\n")).toContain(key);
      expect(visible.renderCall(args, theme, context()).render(80).join("\n")).not.toContain(key);
      expect(
        renderer
          .renderResult(result("retained output"), current, theme, current)
          .render(80)
          .join("\n")
      ).toContain("retained output");
      expect(current.args).toBe(args);
    }
    const args = { path: "example.txt" };
    expect(
      createToolDisplayRenderers("read", undefined, { showParameters: false })
        .renderCall(args, theme, context({ expanded: true }))
        .render(80)
        .join("\n")
    ).toContain('"path"');
  });
  it("keeps FFF multi-search patterns and scope visible in expanded and standalone summaries", () => {
    for (const name of ["fff-multi-grep", "multi_grep"]) {
      const adapter = officialFffAdapter({
        name,
        description: "FFF multi-search",
        parameters: { type: "object", properties: { patterns: { type: "array" } } },
        sourceInfo: {
          source: "npm:@ff-labs/pi-fff@0.10.6",
          path: "/fff/src/index.ts",
          scope: "user",
          origin: "package"
        }
      })!;
      const args = { patterns: ["parse_config", "parseConfig"], constraints: "src/** !test/" };
      const coordinator = new TranscriptCoordinator("multi-search");
      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "multi" },
          name,
          args,
          adapter,
          "historical",
          true
        );
        for (const options of [{}, { binding: { call, coordinator } }]) {
          const renderer = createToolDisplayRenderers(name, adapter, options);
          const rows = renderer
            .renderCall(args, theme, context({ expanded: true }))
            .render(100)
            .join("\n");
          expect(rows).toContain("parse_config, parseConfig in src/** !test/");
          expect(rows).not.toContain('"patterns"');
        }
      } finally {
        coordinator.dispose();
      }
    }
  });
  it("uses the current adapter's parameter policy after late registration and generic fallback", () => {
    const adapter = officialFffAdapter({
      name: "fffind",
      description: "FFF find",
      parameters: { type: "object", properties: { pattern: { type: "string" } } },
      sourceInfo: {
        source: "npm:@ff-labs/pi-fff@0.10.6",
        path: "/fff/src/index.ts",
        scope: "user",
        origin: "package"
      }
    })!;
    const coordinator = new TranscriptCoordinator("parameter-policy");
    try {
      const args = { pattern: "", path: "**/AGENTS.md", limit: 10 };
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "search" },
        "fffind",
        args,
        genericAdapter,
        "historical",
        true
      );
      const renderer = createToolDisplayRenderers("fffind", genericAdapter, {
        binding: { call, coordinator }
      });
      const heading = () => renderer.renderCall(args, theme, context()).render(80).join("\n");
      expect(heading()).toContain('"limit"');
      coordinator.setAdapter(call, adapter);
      expect(heading()).not.toContain('"limit"');
      expect(heading()).toContain("**/AGENTS.md");
      coordinator.result(
        call,
        { ...result("retained output"), details: { unsupported: true } },
        "success"
      );
      expect(heading()).toContain('"limit"');
      expect(call.args).toBe(args);
    } finally {
      coordinator.dispose();
    }
  });
  it("keeps compact group diagnostics with their heading without adding sibling text gaps", () => {
    const coordinator = new TranscriptCoordinator("group-notices");
    try {
      const adapter = nativeAdapter("read")!;
      const first = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" },
        "read",
        { path: "a.ts" },
        adapter,
        "historical"
      );
      const sibling = coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "second" },
        "read",
        { path: "b.ts" },
        adapter,
        "historical"
      );
      const supplied = {
        ...result("retained sibling text"),
        details: { truncation: { truncated: true } }
      };
      coordinator.result(first, result("first result"), "success");
      coordinator.result(sibling, supplied, "success");
      const heading = createToolDisplayRenderers("read", adapter, {
        binding: { call: first, coordinator }
      })
        .renderCall(first.args, theme, context())
        .render(80)
        .join("\n");
      expect(heading).toContain("Read a.ts, b.ts");
      expect(heading).toContain("Tool output truncated");
      const renderer = createToolDisplayRenderers("read", adapter, {
        binding: { call: sibling, coordinator }
      });
      expect(renderer.renderResult(supplied, context(), theme, context()).render(80)).toEqual([]);
      coordinator.expand(first, true);
      const expanded = renderer
        .renderResult(supplied, context(), theme, context())
        .render(80)
        .join("\n");
      expect(expanded).toContain("retained sibling text");
      expect(expanded).toContain("Tool output truncated");
    } finally {
      coordinator.dispose();
    }
  });
  it("keeps failed read and FFF diagnostics visible in compact groups without duplicating sibling text", () => {
    const coordinator = new TranscriptCoordinator("group-failures");
    try {
      const adapters = [
        nativeAdapter("read")!,
        officialFffAdapter({
          name: "ffgrep",
          description: "FFF search",
          parameters: { type: "object", properties: { pattern: { type: "string" } } },
          sourceInfo: {
            source: "npm:@ff-labs/pi-fff@0.10.6",
            path: "/fff/src/index.ts",
            scope: "user",
            origin: "package"
          }
        })!
      ];
      const first = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "success" },
        "read",
        { path: "a.ts" },
        adapters[0]!,
        "historical"
      );
      coordinator.result(first, result("successful body stays hidden"), "success");
      const diagnostics = ["Permission denied", "Retry with rg or another available tool."];
      const failures = adapters.map((adapter, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index + 1, toolCallId: `failed-${index}` },
          index === 0 ? "read" : "ffgrep",
          { path: "node_modules/file.ts", pattern: "needle" },
          adapter,
          "historical"
        );
        coordinator.result(call, result(diagnostics[index]!), "failure");
        return call;
      });
      const heading = createToolDisplayRenderers(first.name, first.adapter, {
        binding: { call: first, coordinator }
      })
        .renderCall(first.args, theme, context())
        .render(100)
        .join("\n");
      expect(heading).toContain("2 failed");
      for (const diagnostic of diagnostics) expect(heading).toContain(diagnostic);
      expect(heading).not.toContain("successful body stays hidden");
      for (const call of failures) {
        const renderer = createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        });
        const current = context({ args: call.args, isError: true });
        expect(renderer.renderResult(call.result!, current, theme, current).render(100)).toEqual(
          []
        );
        coordinator.expand(call, true);
        expect(
          renderer.renderResult(call.result!, current, theme, current).render(100).join("\n")
        ).toContain(diagnostics[failures.indexOf(call)]!);
        coordinator.expand(call, false);
      }
    } finally {
      coordinator.dispose();
    }
  });

  it("keeps supplied read results and backend limitations inspectable", () => {
    const failed = body("read", result("Permission denied"), context({ isError: true }))
      .render(80)
      .join("\n");
    expect(failed).toContain("Permission denied");
    const successful = body("read", {
      ...result("content\ncontent"),
      details: { truncation: { truncated: true } }
    })
      .render(80)
      .join("\n");
    expect(successful).toContain("truncated");
    expect(successful).not.toContain("content");
  });

  it("replaces streamed previews with the final payload and isolates overlapping calls", () => {
    const renderer = createToolDisplayRenderers("bash", nativeAdapter("bash"));
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
    const renderer = createToolDisplayRenderers("bash", nativeAdapter("bash"));
    expect(
      renderer
        .renderCall(
          { command: "false" },
          theme,
          context({ isError: true, executionStarted: false })
        )
        .render(80)
        .map(stripTerminalSequences)
        .join("\n")
    ).toContain("Ran false");
    expect(
      renderer
        .renderCall(
          {},
          theme,
          context({ isPartial: true, argsComplete: false, executionStarted: false })
        )
        .render(80)
        .join("\n")
    ).toContain("Preparing");
    expect(
      renderer
        .renderCall({ command: "true" }, theme, context({ executionStarted: false }))
        .render(80)
        .map(stripTerminalSequences)
        .join("\n")
    ).toContain("Ran true");
  });

  it("retains native unified patches with a separate compact budget and expanded inspection", () => {
    const patch =
      "--- a/example.txt\n+++ b/example.txt\n@@ -0,0 +1,20 @@\n" +
      Array.from({ length: 20 }, (_, index) => `+added ${index}`).join("\n") +
      "\n";
    const value = { ...result("Successfully edited example.txt"), details: { patch } };
    const compact = body("edit", value).render(80).map(stripTerminalSequences).join("\n");
    expect(compact).toContain("+20 -0");
    expect(compact).toContain("1 +added 0");
    expect(compact).toContain("20 +added 19");
    expect(compact).toContain("more rows");
    expect(
      body("edit", value, context({ expanded: true }))
        .render(80)
        .map(stripTerminalSequences)
        .join("\n")
    ).toContain("10 +added 9");
  });

  it("uses explicit typed MCP facts without inferring identity or exposing arbitrary details", () => {
    const supplied = {
      content: [{ type: "text" as const, text: "flattened" }],
      details: { secret: "private-details", image: "private-base64" }
    };
    const generic = createToolDisplayRenderers("read");
    expect(generic.renderCall({ path: "a" }, theme, context()).render(80).join("\n")).toContain(
      "Called read("
    );
    const genericResult = generic
      .renderResult(supplied, context(), theme, context())
      .render(80)
      .join("\n");
    expect(genericResult).not.toContain("private");
    for (const outcome of [
      "transport-error",
      "returned-error",
      "success",
      "unavailable"
    ] as const) {
      const renderer = createToolDisplayRenderers("proxy", {
        id: "owner:mcp",
        family: "invocation",
        mcp: () => ({
          server: "docs",
          tool: "search",
          outcome,
          content: [
            { type: "text", text: "before" },
            { type: "media", mimeType: "image/png", contentIndex: 1 },
            { type: "resource", uri: "file:///resource", text: "after" }
          ]
        })
      });
      const rows = renderer
        .renderResult(supplied, context(), theme, context())
        .render(80)
        .join("\n");
      expect(rows).toContain("before");
      expect(rows.indexOf("before")).toBeLessThan(rows.indexOf("Media"));
      expect(rows.indexOf("Media")).toBeLessThan(rows.indexOf("after"));
      expect(rows.includes("Transport error")).toBe(outcome === "transport-error");
      expect(rows.includes("Tool returned an error")).toBe(outcome === "returned-error");
      expect(rows).not.toContain("private");
    }
  });

  it("treats typed MCP identities as text rather than terminal control sequences", () => {
    const facts: McpFacts = {
      server: "docs\x1b]52;c;YQ==\x07",
      tool: "search\x1b[2J",
      outcome: "success",
      content: []
    };
    for (const showParameters of [false, true]) {
      const renderer = createToolDisplayRenderers(
        "proxy",
        {
          id: "owner:mcp-identity",
          family: "invocation",
          mcp: () => facts
        },
        { showParameters }
      );
      const rows = renderer.renderCall({}, theme, context()).render(80).join("\n");
      expect(rows).toContain("docs.search");
      expect(rows).not.toContain("\x1b");
    }
  });
  it("uses row-local result metadata for standalone MCP headings and error markers", () => {
    const renderer = createToolDisplayRenderers("proxy", {
      id: "owner:mcp-result",
      family: "invocation",
      mcp: (_args, supplied) => supplied?.details as McpFacts | undefined
    });
    let errorMarker = "",
      successMarker = "";
    const themed: ToolDisplayRenderers = {
      ...renderer,
      renderCall(args, theme, context) {
        errorMarker = theme.fg("error", "•");
        successMarker = theme.fg("success", "•");
        return renderer.renderCall(args, theme, context);
      }
    };
    const createRow = (id: string, outcome: McpFacts["outcome"], tool: string) => {
      const row = new ToolExecutionComponent(
        "proxy",
        id,
        {},
        {},
        themed,
        { requestRender() {} } as TUI,
        "/tmp"
      );
      row.updateResult({
        content: [{ type: "text", text: "flattened result" }],
        details: {
          server: "docs",
          tool,
          outcome,
          content: [{ type: "text", text: "typed result" }]
        } satisfies McpFacts,
        isError: false
      });
      return row;
    };
    const failed = createRow("failed", "returned-error", "search");
    const successful = createRow("successful", "success", "list");
    failed.invalidate();
    const failedRows = failed.render(80).join("\n");
    expect(stripTerminalSequences(failedRows)).toContain("Called docs.search");
    expect(stripTerminalSequences(failedRows)).not.toContain("docs.search(");
    expect(errorMarker).not.toBe(successMarker);
    expect(failedRows).toContain(errorMarker);
    const successfulRows = successful.render(80).join("\n");
    expect(stripTerminalSequences(successfulRows)).toContain("Called docs.list");
    expect(successfulRows).toContain(successMarker);
  });

  it("rebuilds theme-dependent spans after invalidation and handles narrow command headers", () => {
    let color = "\x1b[31m";
    const changingTheme = {
      ...theme,
      fg: (_token: string, text: string) => `${color}${text}\x1b[0m`
    };
    const renderer = createToolDisplayRenderers("bash", nativeAdapter("bash"));
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
