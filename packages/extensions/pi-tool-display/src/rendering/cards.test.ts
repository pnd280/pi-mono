import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  initTheme,
  ToolExecutionComponent,
  type AgentToolResult
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences,
  visibleWidth
} from "@earendil-works/pi-tui";
import type { OutputText } from "@pi-mono/utils/output-text";
import { createToolDisplayRenderers as createPublicRenderers } from "pi-tool-display/renderers";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import {
  genericAdapter,
  nativeAdapter,
  piFffAdapter,
  todoDisplayAdapter,
  type McpFacts,
  type ToolDisplayAdapter
} from "../adapters/index.ts";
import { renderingTui } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { createToolDisplayRenderers } from "./cards.ts";
import type { ToolDisplayRenderers } from "./types.ts";

type Context = Parameters<ToolDisplayRenderers["renderCall"]>[2];

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: (_color: string) => "",
  bold: (text: string) => text
};

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
  return createPublicRenderers(name, nativeAdapter(name)).renderResult(
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
    muted: "\x1b[2m",
    error: "\x1b[31m",
    warning: "\x1b[33m",
    syntaxString: "\x1b[32m",
    toolOutput: "\x1b[37m"
  };

  return {
    ...theme,
    fg: (token: string, text: string) => `${colors[token] ?? "\x1b[39m"}${text}\x1b[39m`
  };
}

describe("tool display renderers", () => {
  it("animates live headings without preparing unrelated cards or unchanged result bodies", () => {
    let tick = () => {};

    const coordinator = new TranscriptCoordinator("animation-cache", {
      animationClock: {
        start(callback) {
          tick = callback;

          return () => {};
        }
      }
    });
    let preparations = 0;
    const shell = {
      ...nativeAdapter("bash")!,
      textParts(text: string) {
        preparations++;

        return [{ kind: "output" as const, text }];
      }
    };
    const rows: ToolExecutionComponent[] = [];

    try {
      for (const [index, name, origin] of [
        [0, "bash", "historical"],
        [1, "bash", "live"],
        [2, "read", "historical"],
        [3, "read", "live"]
      ] as const) {
        const args = name === "bash" ? { command: `echo ${index}` } : { path: `${index}.txt` };
        const adapter = name === "bash" ? shell : nativeAdapter(name)!;
        const call = coordinator.add(
          { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
          name,
          args,
          adapter,
          origin
        );
        const supplied = result(`output ${index}`);
        coordinator.result(call, supplied, "success", origin === "live");
        const row = new ToolExecutionComponent(
          name,
          String(index),
          args,
          { showImages: false },
          createToolDisplayRenderers(name, adapter, { binding: { call, coordinator } }),
          renderingTui(),
          "/tmp"
        );
        row.updateResult({ ...supplied, isError: false }, origin === "live");
        coordinator.attach(call, {
          invalidate: () => row.invalidate(),
          requestRender: () => {},
          setExpanded: (expanded) => row.setExpanded(expanded)
        });
        rows.push(row);
      }

      const render = () => rows.map((row) => stripTerminalSequences(row.render(80).join("\n")));
      const initial = render();
      expect(preparations).toBe(2);
      tick();
      const animated = render();
      expect(animated[0]).toBe(initial[0]);
      expect(animated[1]).not.toBe(initial[1]);
      expect(animated[2]).not.toBe(initial[2]); // Completed group leader, live sibling.
      expect(animated[3]).toBe(initial[3]);
      expect(preparations).toBe(2);
      tick();
      expect(render()).toEqual(initial);
      expect(preparations).toBe(2);

      coordinator.result(coordinator.byId("1")!, result("replacement output"), "success");
      expect(render()[1]).toContain("replacement output");
      expect(preparations).toBe(3);
      rows[0]!.invalidate();
      render();
      expect(preparations).toBe(4);
    } finally {
      coordinator.dispose();
    }
  });

  it.each(["custom", "bash"])(
    "bounds collapsed %s arguments before formatting and retains them on expansion",
    (name) => {
      const command = `BEGIN ${"middle ".repeat(75_000)} FINAL_ARGUMENT`;
      const current = context({ args: { command } });
      let largestStyledText = 0;
      const measuredTheme = {
        ...theme,
        fg(color: string, text: string) {
          largestStyledText = Math.max(largestStyledText, text.length);

          return theme.fg(color, text);
        }
      };
      const renderer = createToolDisplayRenderers(name, nativeAdapter(name));
      const header = renderer.renderCall(current.args, measuredTheme, current);
      const compact = header.render(100);
      expect(compact.length).toBeLessThanOrEqual(5);
      expect(compact.join("\n")).toContain("BEGIN");
      expect(compact.join("\n")).toContain("more details");
      expect(compact.join("\n")).not.toContain("FINAL_ARGUMENT");
      expect(largestStyledText).toBeLessThanOrEqual(16 * 1024);
      const expanded = renderer.renderCall(current.args, theme, {
        ...current,
        expanded: true,
        lastComponent: header
      });
      expect(expanded.render(100).join("\n")).toContain("FINAL_ARGUMENT");
      expect(current.args).toEqual({ command });
    }
  );

  it.each(["custom", "bash"])(
    "bounds collapsed %s result styling to head and tail excerpts",
    (name) => {
      const source = `${name === "bash" ? "\x1b[31m" : ""}BEGIN\n${"middle output ".repeat(40_000)}\nFINAL_RESULT${name === "bash" ? "\n\n \n\x1b[0m" : ""}`;
      let largestStyledText = 0;
      const measuredTheme = {
        ...theme,
        fg(color: string, text: string) {
          largestStyledText = Math.max(largestStyledText, text.length);

          return theme.fg(color, text);
        }
      };
      const current = context();
      const renderer = createToolDisplayRenderers(name, nativeAdapter(name));
      const rows = renderer
        .renderResult(result(source), current, measuredTheme, current)
        .render(100);
      const compact = rows.join("\n");

      expect(rows.length).toBeLessThanOrEqual(name === "custom" ? 10 : 5);
      expect(compact).toContain("BEGIN");
      expect(compact).toContain("more output");
      expect(compact).toContain("FINAL_RESULT");
      expect(largestStyledText).toBeLessThanOrEqual(16 * 1024);

      if (name === "bash") {
        const tail = rows.find((row) => stripTerminalSequences(row).includes("FINAL_RESULT"));
        expect(tail).toContain("\x1b[31m");
        expect(stripTerminalSequences(rows.at(-1) ?? "").trim()).toBe("FINAL_RESULT");
      }
    }
  );

  it("shares a result projection between wrapped headings and bodies, then refreshes it", () => {
    let preparations = 0;
    const renderer = createToolDisplayRenderers(
      "custom",
      {
        id: "owner",
        family: "invocation",
        textParts(text) {
          preparations++;

          return [{ kind: "output", text }];
        }
      },
      { showParameters: true }
    );
    const current = context({ args: { query: "long query ".repeat(20) } });

    for (const text of ["first result", "replacement result"]) {
      const header = renderer.renderCall(current.args, theme, current);
      const body = renderer.renderResult(result(text), current, theme, current);
      preparations = 0;
      expect(header.render(80).join("\n")).toContain("│");
      expect(body.render(80).join("\n")).toContain(text);
      expect(preparations).toBe(1);
      header.invalidate();
      body.invalidate();
      header.render(40);
      expect(body.render(40).join("\n")).toContain(text);
      expect(preparations).toBe(2);
    }
  });

  it("refreshes retained slots after observation and published-result changes", () => {
    const coordinator = new TranscriptCoordinator("retained-slots");

    try {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "late" },
        "write",
        { path: "created.txt", content: "new" },
        nativeAdapter("write")!,
        "live",
        true
      );
      const supplied = result("published result");
      coordinator.result(call, supplied, "success", true);
      const renderer = createToolDisplayRenderers(call.name, call.adapter, {
        binding: { call, coordinator }
      });
      const current = context({ args: call.args });
      const header = renderer.renderCall(call.args, theme, current);
      const body = renderer.renderResult(supplied, current, theme, current);
      expect(header.render(80).join("\n")).toContain("Writing created.txt");
      expect(body.render(80).join("\n")).toContain("published result");
      coordinator.fact(call, {
        kind: "change",
        availability: "available",
        change: "creation",
        patch: "@@ -0,0 +1 @@\n+new\n"
      });
      coordinator.fact(call, {
        kind: "operation",
        availability: "available",
        outcome: "success",
        durationMs: 7
      });
      coordinator.result(call, supplied, "success");
      expect(header.render(80).join("\n")).toContain("Added created.txt");
      const observed = body.render(80).join("\n");
      expect(observed).toContain("+new");
      expect(observed).toContain("7ms");
      expect(observed).not.toContain("Before-state unavailable");
      expect(call.result).toBe(supplied);

      const published = result("Rejected by result middleware");
      coordinator.result(call, published, "failure");
      expect(header.render(80).join("\n")).toContain("Write failed created.txt");
      expect(body.render(80).join("\n")).toContain("Rejected by result middleware");
      expect(body.render(80).join("\n")).not.toContain("published result");
      expect(call.result).toBe(published);
    } finally {
      coordinator.dispose();
    }
  });

  it("shares lazy MCP preparation and refreshes both slots when only the result slot updates", () => {
    let preparations = 0;
    const renderer = createPublicRenderers("proxy", {
      id: "owner:lazy-mcp",
      family: "invocation",
      mcp(_args, supplied) {
        preparations++;
        if (typeof supplied?.details !== "string") return undefined;

        return {
          server: "docs",
          tool: supplied.details,
          outcome: "success",
          content: [{ type: "text", text: `typed ${supplied.details}` }]
        };
      }
    });
    const current = context();
    const header = renderer.renderCall(current.args, theme, current);
    expect(preparations).toBe(0);
    expect(header.render(80).join("\n")).toContain("Called proxy");
    expect(preparations).toBe(1);
    const supplied = { ...result("flattened"), details: "search" };
    const body = renderer.renderResult(supplied, current, theme, current);
    expect(preparations).toBe(1);
    expect(header.render(80).join("\n")).toContain("Called docs.search");
    expect(body.render(80).join("\n")).toContain("typed search");
    expect(preparations).toBe(2);

    const updated = renderer.renderResult({ ...supplied, details: "list" }, current, theme, {
      ...current,
      lastComponent: body
    });
    expect(updated).toBe(body);
    expect(body.render(80).join("\n")).toContain("typed list");
    expect(header.render(80).join("\n")).toContain("Called docs.list");
    expect(preparations).toBe(3);
    body.invalidate();
    header.render(80);
    body.render(80);
    expect(preparations).toBe(4);
  });

  it("does not prepare hidden read or grouped text, or bodies for short headings", () => {
    let preparations = 0;
    const adapter = {
      ...nativeAdapter("read")!,
      textParts(text: string) {
        preparations++;

        return [{ kind: "output" as const, text }];
      }
    };
    const coordinator = new TranscriptCoordinator("lazy-bodies");

    try {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "read" },
        "read",
        { path: "large.txt" },
        adapter,
        "historical"
      );
      const supplied = result("retained file body");
      coordinator.result(call, supplied, "success");

      for (const options of [{}, { binding: { call, coordinator } }]) {
        preparations = 0;
        const renderer = createToolDisplayRenderers("read", adapter, options);
        const current = context({ args: call.args });
        const header = renderer.renderCall(call.args, theme, current);
        const body = renderer.renderResult(supplied, current, theme, current);
        expect(preparations).toBe(0);
        header.render(80);
        expect(body.render(80)).toEqual([]);
        expect(preparations).toBe(0);

        coordinator.expand(call, true);
        const expanded = renderer.renderResult(supplied, { ...current, expanded: true }, theme, {
          ...current,
          lastComponent: body
        });
        header.render(80);
        expect(expanded.render(80).join("\n")).toContain("retained file body");
        expect(preparations).toBe(1);
        coordinator.expand(call, false);
      }

      preparations = 0;
      const renderer = createPublicRenderers("custom", { ...adapter, family: "invocation" });
      const current = context();
      const header = renderer.renderCall(current.args, theme, current);
      const body = renderer.renderResult(supplied, current, theme, current);
      header.render(80);
      expect(preparations).toBe(0);
      expect(body.render(80).join("\n")).toContain("retained file body");
      expect(preparations).toBe(1);
    } finally {
      coordinator.dispose();
    }
  });

  it("uses adapter contract validation for fallback and grouping without provider-specific IDs", () => {
    const adapter = {
      id: "documentation:search",
      family: "search" as const,
      supports: (_args: unknown, result: AgentToolResult<unknown>) =>
        result.details === "supported",
      exploration: () => [
        {
          scope: { kind: "directory" as const, value: "docs" },
          parts: [{ kind: "value" as const, text: "documentation" }]
        }
      ]
    };
    const coordinator = new TranscriptCoordinator("adapter-validation");

    try {
      const args = { pattern: "needle", path: "docs", limit: 7 };
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "search" },
        "search_docs",
        args,
        adapter,
        "historical"
      );
      coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
        "search_docs",
        args,
        adapter,
        "historical"
      );
      const renderer = createToolDisplayRenderers(call.name, adapter, {
        binding: { call, coordinator }
      });
      const heading = () => renderer.renderCall(args, theme, context()).render(120).join("\n");
      expect(coordinator.group(call)).toBeDefined();

      for (const supported of [true, false, true]) {
        const retained = {
          ...result("retained documentation"),
          details: supported ? "supported" : "unknown"
        };
        coordinator.result(call, retained, "success");

        if (supported) {
          expect(coordinator.group(call)).toBeDefined();
          expect(heading()).toContain("Explored");
          expect(heading()).not.toContain('"limit":7');
        } else {
          expect(coordinator.group(call)).toBeUndefined();
          expect(heading()).toContain('search_docs({"pattern":"needle","path":"docs","limit":7})');
        }

        coordinator.expand(call, true);
        expect(
          renderer
            .renderResult(retained, { expanded: true, isPartial: false }, theme, context())
            .render(120)
            .join("\n")
        ).toContain("retained documentation");
        coordinator.expand(call, false);
        expect(call.adapter).toBe(adapter);
        expect(call.result).toBe(retained);
      }
    } finally {
      coordinator.dispose();
    }
  });

  it("groups adjacent todo calls under one Todos heading", () => {
    const coordinator = new TranscriptCoordinator("todo-groups");

    try {
      const firstArgs = { action: "create", subject: "First task" };
      const secondArgs = { action: "create", subject: "Second task" };
      const first = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "todo-1" },
        "todo",
        firstArgs,
        todoDisplayAdapter,
        "live"
      );
      const second = coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "todo-2" },
        "todo",
        secondArgs,
        todoDisplayAdapter,
        "live"
      );
      coordinator.update(first, "executing");
      coordinator.update(second, "executing");
      expect(coordinator.group(first)).toBeDefined();
      expect(todoDisplayAdapter.groupTitle).toBe("Todos");

      const firstRenderer = createToolDisplayRenderers("todo", todoDisplayAdapter, {
        binding: { call: first, coordinator }
      });
      const secondRenderer = createToolDisplayRenderers("todo", todoDisplayAdapter, {
        binding: { call: second, coordinator }
      });
      const heading = () =>
        [
          ...firstRenderer.renderCall(firstArgs, theme, context()).render(120),
          ...secondRenderer.renderCall(secondArgs, theme, context()).render(120)
        ].join("\n");

      expect(heading().split("\n")[0]).toBe("• Todos");
      expect(heading()).toContain("Creating (running) First task");
      expect(heading()).toContain("Creating (running) Second task");
      expect(heading()).not.toContain("{");

      coordinator.result(first, result("Created #1"), "success", false);
      expect(heading()).toContain("Created First task");
      expect(heading()).toContain("Creating (running) Second task");

      coordinator.result(second, result("Task creation failed"), "failure");
      expect(heading().split("\n")[0]).toBe("• Todos · 1 failed");

      coordinator.expand(first, true);
      expect(heading()).toContain("Todos · Created First task");
      expect(heading()).toContain("Todos · Create failed Second task");
    } finally {
      coordinator.dispose();
    }
  });

  it.each([{}, { action: "unknown" }, { action: "list", status: 42 }])(
    "falls back to a named generic card for invalid todo arguments %j",
    (args) => {
      const coordinator = new TranscriptCoordinator("invalid-todo");

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "invalid" },
          "todo",
          args,
          todoDisplayAdapter,
          "historical"
        );
        coordinator.add(
          { messageTimestamp: 1, contentIndex: 1, toolCallId: "valid" },
          "todo",
          { action: "list" },
          todoDisplayAdapter,
          "historical"
        );
        const retained = result("Invalid todo arguments");
        coordinator.result(call, retained, "failure");
        const renderer = createToolDisplayRenderers("todo", todoDisplayAdapter, {
          binding: { call, coordinator },
          showParameters: false
        });

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);
          const current = context({ args, expanded });
          expect(renderer.renderCall(args, theme, current).render(120)).toEqual([
            `• Call failed todo(${JSON.stringify(args)})`
          ]);
          expect(
            renderer.renderResult(retained, current, theme, current).render(120).join("\n")
          ).toContain("Invalid todo arguments");
        }

        expect(coordinator.group(call)).toBeUndefined();
        expect(call.adapter).toBe(todoDisplayAdapter);
        expect(call.args).toBe(args);
        expect(call.result).toBe(retained);
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("does not group todo calls separated by another tool", () => {
    const coordinator = new TranscriptCoordinator("todo-separation");

    try {
      const first = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "todo-1" },
        "todo",
        { action: "create", subject: "First task" },
        todoDisplayAdapter,
        "historical"
      );
      coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "read-1" },
        "read",
        { path: "a.ts" },
        nativeAdapter("read")!,
        "historical"
      );
      const third = coordinator.add(
        { messageTimestamp: 1, contentIndex: 2, toolCallId: "todo-2" },
        "todo",
        { action: "create", subject: "Second task" },
        todoDisplayAdapter,
        "historical"
      );

      expect(coordinator.group(first)).toBeUndefined();
      expect(coordinator.group(third)).toBeUndefined();
    } finally {
      coordinator.dispose();
    }
  });

  it.each([
    ["edit", "Edit", "Editing", "Edited", { path: "example.ts", edits: [] }],
    ["write", "Write", "Writing", "Wrote", { path: "example.ts", content: "replacement" }],
    ["read", "Read", "Reading", "Read", { path: "example.ts" }],
    ["grep", "Search", "Searching", "Searched", { pattern: "needle", path: "." }],
    ["find", "Search", "Searching", "Searched", { pattern: "*.ts", path: "." }],
    ["ls", "List", "Listing", "Listed", { path: "." }],
    ["bash", "Run", "Running", "Ran", { command: "printf example" }],
    ["powershell", "Run", "Running", "Ran", { command: "Write-Output example" }],
    ["fffind", "Search", "Searching", "Searched", { pattern: "example" }],
    ["fffind", "List", "Listing", "Listed", { pattern: "" }],
    ["ffgrep", "Search", "Searching", "Searched", { pattern: "example" }],
    ["fff-multi-grep", "Search", "Searching", "Searched", { patterns: ["example"] }],
    ["custom.lookup", "Call", "Calling", "Called", { query: "example" }]
  ] as const)(
    "keeps %s action headings through preparation, queueing, execution, completion, and replay",
    (name, action, active, complete, args) => {
      const adapter = name.startsWith("ff")
        ? piFffAdapter({
            name,
            description: "FFF search",
            parameters: {
              type: "object",
              properties:
                name === "fff-multi-grep"
                  ? { patterns: { type: "array" } }
                  : { pattern: { type: "string" } }
            },
            sourceInfo: {
              source: "npm:@ff-labs/pi-fff@0.10.6",
              path: "/fff/src/index.ts",
              scope: "user",
              origin: "package"
            }
          })!
        : (nativeAdapter(name) ?? genericAdapter);

      // Replayed completion must not depend on a preceding call, execution event, or component.
      for (const isError of [false, true]) {
        const heading = createToolDisplayRenderers(name, adapter)
          .renderCall(args, theme, context({ isError, executionStarted: false }))
          .render(100)
          .map(stripTerminalSequences)
          .find((line) => /^[•◦] /.test(line));
        expect(heading).toMatch(
          new RegExp(`^[•◦] ${isError ? `${action} failed` : complete}(?: |$)`)
        );
      }

      for (const coordinated of [false, true]) {
        const coordinator = new TranscriptCoordinator("action-headings");

        try {
          const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: name };
          const call = coordinator.add(reference, name, {}, adapter, "live");
          const renderer = createToolDisplayRenderers(
            name,
            adapter,
            coordinated ? { binding: { call, coordinator } } : {}
          );
          const row = new ToolExecutionComponent(
            name,
            name,
            {},
            { showImages: false },
            renderer,
            renderingTui(),
            "/tmp"
          );
          if (coordinated)
            coordinator.attach(call, {
              invalidate: () => row.invalidate(),
              requestRender: () => {},
              setExpanded: (expanded) => row.setExpanded(expanded)
            });

          const assertHeading = (verb: string, groupVerb: string) => {
            for (const expanded of [false, true]) {
              if (coordinated) coordinator.expand(call, expanded);
              else row.setExpanded(expanded);
              const expected =
                coordinated && !expanded && coordinator.group(call) ? groupVerb : verb;

              for (const width of [40, 100]) {
                const heading = row
                  .render(width)
                  .map(stripTerminalSequences)
                  .find((line) => /^[•◦] /.test(line));
                expect(
                  heading,
                  `${name}: ${call.lifecycle}, coordinated=${coordinated}, expanded=${expanded}`
                ).toMatch(new RegExp(`^[•◦] ${expected}(?: |$)`));
              }
            }
          };

          assertHeading(name === "fffind" && action === "List" ? "Searching" : active, "Exploring");
          coordinator.add(reference, name, args, adapter, "live");
          row.updateArgs(args);
          assertHeading(active, "Exploring");
          coordinator.update(call, "queued");
          row.setArgsComplete();
          assertHeading(active, "Exploring");
          coordinator.update(call, "executing");
          row.markExecutionStarted();
          const partial = result("partial output");
          coordinator.result(call, partial, "success", true);
          row.updateResult({ ...partial, isError: false }, true);
          assertHeading(active, "Exploring");
          const final = result("retained output");

          for (const isError of [false, true]) {
            coordinator.result(call, final, isError ? "failure" : "success");
            row.updateResult({ ...final, isError });
            assertHeading(isError ? `${action} failed` : complete, "Explored");
          }

          if (coordinated) {
            coordinator.result(call, final, "cancelled");
            assertHeading(`${action} cancelled`, "Explored");
          }
        } finally {
          coordinator.dispose();
        }
      }
    }
  );

  it.each([
    "read",
    "grep",
    "find",
    "ls",
    "bash",
    "powershell",
    "edit",
    "write",
    "fffind",
    "ffgrep",
    "fff-multi-grep",
    "custom"
  ])("keeps %s cancellation diagnostics warning-colored in compact and expanded cards", (name) => {
    const coordinator = new TranscriptCoordinator("cancelled-colors");
    const adapter =
      nativeAdapter(name) ??
      piFffAdapter(fffToolInfo(name, name === "fff-multi-grep")) ??
      genericAdapter;
    const args = { path: "file.ts", pattern: "needle", patterns: ["needle"], command: "sleep 30" };
    const colored = semanticTheme();

    try {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: name },
        name,
        args,
        adapter,
        "live"
      );
      coordinator.result(call, result("Operation aborted: retained diagnostic"), "cancelled");
      const renderer = createToolDisplayRenderers(name, adapter, {
        binding: { call, coordinator }
      });

      for (const expanded of [false, true]) {
        coordinator.expand(call, expanded);
        const current = context({ expanded });
        const rows = [
          ...renderer.renderCall(args, colored, current).render(100),
          ...renderer.renderResult(call.result!, current, colored, current).render(100)
        ].join("\n");
        expect(rows).toContain(colored.fg("warning", "Operation aborted: retained diagnostic"));
        expect(rows).not.toContain(colored.fg("error", "Operation aborted: retained diagnostic"));
      }
    } finally {
      coordinator.dispose();
    }
  });

  it.each(["failure", "cancelled", "unavailable"] as const)(
    "keeps custom action identity and ignores partial %s metadata",
    (outcome) => {
      const renderer = createPublicRenderers("health", {
        id: "owner:health",
        family: "invocation",
        headingVerbs: () => ({ action: "Check", pending: "Checking", complete: "Checked" }),
        outcome: () => outcome
      });
      const current = context({ isPartial: true });
      const header = renderer.renderCall({}, theme, current);
      renderer.renderResult(result("diagnostic"), current, theme, current);
      expect(header.render(100)[0]).toBe("◦ Checking health");
      renderer.renderResult(result("diagnostic"), { ...current, isPartial: false }, theme, current);
      const status = {
        failure: "failed",
        cancelled: "cancelled",
        unavailable: "outcome unavailable"
      }[outcome];
      expect(header.render(100)[0]).toBe(`• Check ${status} health`);
    }
  );

  it("identifies each failed or cancelled member without repeating native cancellation boilerplate", () => {
    const coordinator = new TranscriptCoordinator("group-outcomes", { cwd: "/tmp" });

    try {
      const calls = (["success", "failure", "cancelled"] as const).map((outcome, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: outcome },
          "read",
          { path: `${outcome}.ts` },
          nativeAdapter("read")!,
          "historical"
        );
        coordinator.result(
          call,
          result(outcome === "cancelled" ? "Operation aborted" : "retained diagnostic"),
          outcome
        );

        return call;
      });
      const pending = coordinator.add(
        { messageTimestamp: 1, contentIndex: 3, toolCallId: "pending" },
        "read",
        { path: "pending.ts" },
        nativeAdapter("read")!,
        "live"
      );
      coordinator.update(pending, "queued");
      calls.push(pending);
      const rows = calls
        .flatMap((call) =>
          createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context())
            .render(100)
        )
        .join("\n");
      expect(rows.split("\n")[0]).toBe("• Exploring . · 1 failed, 1 cancelled");
      expect(rows).toContain("Reading (queued) pending.ts");
      expect(rows).not.toContain("outcome unavailable");
      expect(rows).toContain("Read success.ts");
      expect(rows).toContain("Read failed failure.ts");
      expect(rows).toContain("Read cancelled cancelled.ts");
      expect(rows).toContain("retained diagnostic");
      expect(rows).not.toContain("Operation aborted");
    } finally {
      coordinator.dispose();
    }
  });

  it("uses completed tense for grouped exploration members", () => {
    const coordinator = new TranscriptCoordinator("group-member-tense", { cwd: "/tmp" });

    try {
      const calls = ["a", "b"].map((name, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: name },
          "ls",
          { path: "." },
          nativeAdapter("ls")!,
          "historical"
        );
        coordinator.result(call, result("listed"), "success");

        return call;
      });
      const rows = calls
        .flatMap((call) =>
          createToolDisplayRenderers("ls", call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context())
            .render(100)
        )
        .join("\n");

      expect(rows).toContain("Listed");
      expect(rows).not.toContain("List .");
    } finally {
      coordinator.dispose();
    }
  });

  it("uses accent for completed exploration headings", () => {
    const coordinator = new TranscriptCoordinator("group-heading-colors", { cwd: "/tmp" });
    const themed = semanticTheme();

    try {
      const calls = ["a.ts", "b.ts"].map((path, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: path },
          "read",
          { path },
          nativeAdapter("read")!,
          "historical"
        );
        coordinator.result(call, result("retained"), "success");

        return call;
      });
      const rows = createToolDisplayRenderers("read", nativeAdapter("read"), {
        binding: { call: calls[0]!, coordinator }
      })
        .renderCall(calls[0]!.args, themed, context())
        .render(100);

      expect(rows[0]).toContain(themed.fg("accent", "Explored"));
      expect(rows[0]).toContain(themed.fg("accent", "•"));
      expect(rows[0]).not.toContain(themed.fg("toolTitle", "Explored"));
    } finally {
      coordinator.dispose();
    }
  });

  it("colors standalone action text by lifecycle and outcome while preserving marker colors", () => {
    const themed = semanticTheme();
    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));
    const args = { path: "a.ts" };
    const render = (current: Context) =>
      renderer.renderCall(args, themed, current).render(100)[0] ?? "";

    const completed = render(context());
    expect(completed).toContain(themed.fg("accent", "Read"));
    expect(completed).toContain(themed.fg("accent", "•"));

    const pending = render(
      context({ isPartial: true, argsComplete: true, executionStarted: true })
    );
    expect(pending).toContain(themed.fg("warning", "Reading"));
    expect(pending).toContain(themed.fg("warning", "◦"));
    expect(pending).not.toContain(themed.fg("accent", "Reading"));

    const failed = render(context({ isError: true }));
    expect(failed).toContain(themed.fg("error", "Read failed"));
    expect(failed).toContain(themed.fg("error", "•"));
  });

  it("colors cancelled standalone actions and markers as errors", () => {
    const coordinator = new TranscriptCoordinator("standalone-cancelled-action-color");
    const themed = semanticTheme();

    try {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "cancelled" },
        "read",
        { path: "a.ts" },
        nativeAdapter("read")!,
        "live"
      );
      coordinator.result(call, result("Operation aborted"), "cancelled");
      const line = createToolDisplayRenderers("read", call.adapter, {
        binding: { call, coordinator }
      })
        .renderCall(call.args, themed, context())
        .render(100)[0]!;

      expect(line).toContain(themed.fg("error", "Read cancelled"));
      expect(line).toContain(themed.fg("error", "•"));
    } finally {
      coordinator.dispose();
    }
  });

  it("uses the same error color for cancelled group outcomes and members", () => {
    const coordinator = new TranscriptCoordinator("cancelled-group-colors", { cwd: "/tmp" });
    const themed = semanticTheme();

    try {
      const calls = ["cancelled.ts", "success.ts"].map((path, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: path },
          "read",
          { path },
          nativeAdapter("read")!,
          "live"
        );
        coordinator.result(
          call,
          result("retained"),
          path.startsWith("cancel") ? "cancelled" : "success"
        );

        return call;
      });
      const rows = createToolDisplayRenderers("read", calls[0]!.adapter, {
        binding: { call: calls[0]!, coordinator }
      })
        .renderCall(calls[0]!.args, themed, context())
        .render(100)
        .join("\n");

      expect(rows).toContain(themed.fg("error", "1 cancelled"));
      expect(rows).toContain(themed.fg("error", "Read cancelled"));
      expect(rows).not.toContain(themed.fg("warning", "1 cancelled"));
    } finally {
      coordinator.dispose();
    }
  });

  it("colors homogeneous group action titles and uses accent for mixed groups", () => {
    type GroupState = "pending" | "success" | "failure" | "cancelled" | "unavailable";

    const themed = semanticTheme();

    const assertGroup = (states: readonly GroupState[], actionColor: string, action: string) => {
      const coordinator = new TranscriptCoordinator(`group-action-color-${states.join("-")}`);

      try {
        const calls = states.map((state, index) => {
          const call = coordinator.add(
            { messageTimestamp: 1, contentIndex: index, toolCallId: `${state}-${index}` },
            "read",
            { path: `${state}-${index}.ts` },
            nativeAdapter("read")!,
            "live"
          );
          if (state === "pending") coordinator.update(call, "executing");
          else coordinator.result(call, result("retained"), state);

          return call;
        });
        const line = createToolDisplayRenderers("read", calls[0]!.adapter, {
          binding: { call: calls[0]!, coordinator }
        })
          .renderCall(calls[0]!.args, themed, context())
          .render(100)[0]!;

        expect(line).toContain(themed.fg(actionColor, action));
        expect(line).toContain(themed.fg(actionColor, "•"));
      } finally {
        coordinator.dispose();
      }
    };

    assertGroup(["pending", "pending"], "warning", "Exploring");
    assertGroup(["failure", "cancelled"], "error", "Explored");
    assertGroup(["success", "failure"], "accent", "Explored");
    assertGroup(["unavailable", "unavailable"], "muted", "Explored");
  });

  it("dims grouped lifecycle annotations without recoloring actions or targets", () => {
    const coordinator = new TranscriptCoordinator("group-lifecycle-colors", { cwd: "/tmp" });
    const themed = semanticTheme();

    try {
      const calls = (["queued", "executing"] as const).map((lifecycle, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: lifecycle },
          "read",
          { path: `src/${lifecycle}.ts` },
          nativeAdapter("read")!,
          "live"
        );
        coordinator.update(call, lifecycle);

        return call;
      });

      for (const call of calls) {
        const renderer = createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        });
        const annotation = call.lifecycle === "queued" ? " (queued)" : " (running)";
        const card = renderer.renderCall(call.args, themed, context());
        const rows = card.render(100).join("\n");
        expect(rows).toContain(themed.fg("accent", "Reading"));
        expect(rows).toContain(themed.fg("dim", annotation));
        expect(rows).toContain(themed.fg("text", `${call.reference.toolCallId}.ts`));
        coordinator.result(call, result("retained"), "success");
        expect(stripTerminalSequences(card.render(100).join("\n"))).not.toContain(annotation);
      }
    } finally {
      coordinator.dispose();
    }
  });

  it.each(["edit", "write", "bash", "powershell"])(
    "suppresses only redundant compact %s cancellation text and retains expanded diagnostics",
    (name) => {
      const coordinator = new TranscriptCoordinator("cancelled-boilerplate");
      const shell = name === "bash" || name === "powershell";
      const diagnostic = shell ? "Command aborted" : "Operation aborted";
      const retained = result(shell ? `stdout\n\n${diagnostic}` : diagnostic);

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: name },
          name,
          { path: "file.ts", command: "fixture" },
          nativeAdapter(name)!,
          "live"
        );
        coordinator.result(call, retained, "cancelled");
        const renderer = createToolDisplayRenderers(name, call.adapter, {
          binding: { call, coordinator }
        });

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);
          // Pi may still have the partial flag from a streamed result.
          const current = context({ expanded, isPartial: true });
          const rows = renderer
            .renderResult(retained, current, semanticTheme(), current)
            .render(100)
            .join("\n");
          if (expanded) expect(rows).toContain(semanticTheme().fg("warning", diagnostic));
          else expect(rows).not.toContain(diagnostic);
          expect(rows).not.toContain("(no output)");
          if (shell) expect(rows).toContain("stdout");
        }

        expect(call.result).toBe(retained);
      } finally {
        coordinator.dispose();
      }
    }
  );

  it.each(["failure", "cancelled"] as const)(
    "keeps confirmed %s above unavailable MCP metadata",
    (outcome) => {
      const coordinator = new TranscriptCoordinator("mcp-precedence");
      const adapter = {
        id: "owner:mcp-unavailable",
        family: "invocation" as const,
        mcp: (): McpFacts => ({
          server: "docs",
          tool: "search",
          outcome: "unavailable",
          content: [{ type: "text", text: "diagnostic" }]
        })
      };
      const colored = semanticTheme();

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "proxy" },
          "proxy",
          {},
          adapter,
          "live"
        );
        coordinator.result(call, result("diagnostic"), outcome);
        const renderer = createToolDisplayRenderers("proxy", adapter, {
          binding: { call, coordinator }
        });
        const current = context();
        const header = renderer.renderCall({}, colored, current).render(100).join("\n");
        expect(stripTerminalSequences(header)).toContain(
          outcome === "cancelled" ? "Call cancelled" : "Call failed"
        );
        expect(header).toContain(colored.fg("error", "•"));
        expect(
          renderer.renderResult(call.result!, current, colored, current).render(100).join("\n")
        ).toContain(colored.fg(outcome === "cancelled" ? "warning" : "error", "diagnostic"));

        if (outcome === "failure") {
          const standalone = createPublicRenderers("proxy", adapter);
          expect(
            stripTerminalSequences(
              standalone
                .renderCall({}, colored, context({ isError: true }))
                .render(100)
                .join("\n")
            )
          ).toContain("Call failed");
        }
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("preserves terminal outcomes and waits for completion before labeling a write as added", () => {
    const coordinator = new TranscriptCoordinator("terminal-headings");

    try {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "write" },
        "write",
        { path: "created.ts" },
        nativeAdapter("write")!,
        "live"
      );
      const renderer = createToolDisplayRenderers(call.name, call.adapter, {
        binding: { call, coordinator }
      });
      const heading = () => renderer.renderCall(call.args, theme, context()).render(80)[0];
      coordinator.fact(call, { kind: "change", availability: "available", change: "creation" });
      coordinator.fact(call, {
        kind: "operation",
        availability: "available",
        outcome: "success",
        durationMs: 1
      });
      expect(heading()).toBe("• Writing created.ts");

      for (const [outcome, verb] of [
        ["success", "Added"],
        ["failure", "Write failed"],
        ["cancelled", "Write cancelled"]
      ] as const) {
        coordinator.result(call, result("retained outcome"), outcome);
        expect(heading()).toBe(`• ${verb} created.ts`);
      }

      const historical = coordinator.add(
        { messageTimestamp: 2, contentIndex: 0, toolCallId: "missing" },
        "edit",
        { path: "missing.ts" },
        nativeAdapter("edit")!,
        "historical"
      );
      expect(
        createToolDisplayRenderers(historical.name, historical.adapter, {
          binding: { call: historical, coordinator }
        })
          .renderCall(
            historical.args,
            theme,
            context({ isPartial: true, argsComplete: false, executionStarted: false })
          )
          .render(80)[0]
      ).toBe("• Edit outcome unavailable missing.ts");
    } finally {
      coordinator.dispose();
    }
  });

  it("formats file targets relative to the render cwd and outside targets absolutely", () => {
    const cwd = resolve(homedir(), "display-workspace");
    const paths = [
      [resolve(cwd, "src/file.ts"), "src/file.ts"],
      ["./src/../src/file.ts", "src/file.ts"],
      ["../shared/file.ts", resolve(cwd, "../shared/file.ts")],
      [resolve(cwd + "-other", "file.ts"), resolve(cwd + "-other", "file.ts")],
      ["..", resolve(cwd, "..")],
      ["..cache/file.ts", "..cache/file.ts"],
      [cwd, "."],
      ["~/outside.ts", resolve(homedir(), "outside.ts")],
      ["~", homedir()],
      [`@${resolve(cwd, "src/file.ts")}`, "src/file.ts"],
      [pathToFileURL(resolve(cwd, "src/file name.ts")).href, "src/file name.ts"],
      ["new/未作成 file.ts", "new/未作成 file.ts"]
    ] as const;

    for (const name of ["read", "edit", "write", "ls", "grep", "find"]) {
      const renderer = createToolDisplayRenderers(name, nativeAdapter(name));

      for (const [path, expected] of paths) {
        const args = Object.freeze({ path, pattern: "needle" });

        for (const expanded of [false, true]) {
          const rows = renderer.renderCall(args, theme, context({ cwd, expanded })).render(240);
          expect(rows[0]?.endsWith(` ${expected.split(sep).join("/")}`), `${name}: ${path}`).toBe(
            true
          );
          expect(args.path).toBe(path);
        }
      }
    }

    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));
    expect(
      renderer
        .renderCall(
          { file_path: resolve(cwd, "src/file.ts"), offset: 10, limit: 2 },
          theme,
          context({ cwd })
        )
        .render(240)[0]
    ).toBe("• Read src/file.ts:10-11");
    const generic = createToolDisplayRenderers("read");
    expect(
      generic
        .renderCall({ path: resolve(cwd, "src/file.ts") }, theme, context({ cwd }))
        .render(240)
        .join("\n")
    ).toContain(resolve(cwd, "src/file.ts"));
  });

  it("keeps paths in normal foreground and dims invocation annotations across tools", () => {
    const themed = semanticTheme();
    const cases = [
      {
        name: "read",
        args: { path: "src/file.ts", offset: 15, limit: 2 },
        annotations: [":15-16"],
        paths: ["src/", "file.ts"]
      },
      { name: "write", args: { path: "src/file.ts" }, annotations: [], paths: ["src/", "file.ts"] },
      {
        name: "bash",
        args: { command: "true", timeout: 5 },
        annotations: [" (timeout 5s)"],
        paths: []
      },
      {
        name: "powershell",
        args: { command: "Write-Output ok", timeout: 5 },
        annotations: [" (timeout 5s)"],
        paths: []
      },
      {
        name: "grep",
        args: { pattern: "needle", path: "src", glob: "*.ts" },
        annotations: [" \u2014 ", " (", ")"],
        paths: ["src"]
      },
      {
        name: "fffind",
        args: { pattern: "", path: "src/**" },
        annotations: ["files"],
        paths: ["src/**"]
      },
      { name: "custom", args: {}, annotations: ["(", ")"], paths: [] }
    ];

    for (const { name, args, annotations, paths } of cases) {
      const adapter =
        name === "fffind"
          ? piFffAdapter(fffToolInfo(name))!
          : (nativeAdapter(name) ?? genericAdapter);
      const coordinator = new TranscriptCoordinator("annotation-colors", { cwd: "/tmp" });

      try {
        const calls = [0, 1].map((index) => {
          const call = coordinator.add(
            { messageTimestamp: 1, contentIndex: index, toolCallId: String(index) },
            name,
            args,
            adapter,
            "historical"
          );
          coordinator.result(call, result("retained"), "success");

          return call;
        });
        const call = calls[0]!;

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);

          for (const options of [{}, { binding: { call, coordinator } }]) {
            const renderer = createToolDisplayRenderers(name, adapter, options);
            const rows = renderer
              .renderCall(args, themed, context({ expanded }))
              .render(110)
              .join("\n");
            const grouped = !expanded && "binding" in options && !!coordinator.group(call);

            for (const annotation of annotations) {
              if (!grouped && name === "fffind") {
                expect(stripTerminalSequences(rows)).not.toContain(annotation);
                continue;
              }

              expect(rows, `${name}: ${annotation}`).toContain(themed.fg("dim", annotation));
            }

            for (const path of paths)
              expect(rows, `${name}: ${path}`).toContain(
                themed.fg("text", grouped && path.endsWith("/") ? path.slice(0, -1) : path)
              );
          }
        }
      } finally {
        coordinator.dispose();
      }
    }
  });

  it.each(["success", "failure"] as const)(
    "keeps %s outcomes on the scope heading without call or operation counts",
    (outcome) => {
      const coordinator = new TranscriptCoordinator("heading-counts", { cwd: "/tmp" });
      const path = ".tmp/pi-tool-display-scope-runs-20260917-154954-1015792/a";

      try {
        const calls = ["grep", "ls"].map((name, index) => {
          const call = coordinator.add(
            { messageTimestamp: 1, contentIndex: index, toolCallId: name },
            name,
            { path, pattern: "alpha" },
            nativeAdapter(name)!,
            "historical"
          );
          coordinator.result(
            call,
            result(outcome === "failure" ? "diagnostic" : "retained"),
            outcome
          );

          return call;
        });
        const call = calls[0]!;
        const card = createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        }).renderCall(call.args, theme, context());
        const rows = card.render(110);
        expect(rows[0]).toBe(`• Explored ${path}${outcome === "failure" ? " · 2 failed" : ""}`);
        expect(rows[1]).toBe(
          `  ├ ${outcome === "failure" ? "Search failed" : "Searched"} alpha \u2014 .`
        );
        const narrow = card.render(48);
        if (outcome === "failure") expect(narrow[0]).toBe("• Explored · 2 failed");
        for (const rendered of [rows, narrow])
          expect(rendered.join("\n")).not.toMatch(/\d+ (calls?|reads?|search(?:es)?|lists?)\b/);
        expect(narrow.every((row) => visibleWidth(row) <= 48)).toBe(true);
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("uses scope-relative grouped paths and restores full paths on expansion", () => {
    const cwd = resolve("/workspace/project");
    const coordinator = new TranscriptCoordinator("file-paths", { cwd });

    try {
      const paths = [
        resolve(cwd, "src/file.ts"),
        "src/other.ts",
        "../shared/file.ts",
        "../shared/other.ts"
      ];
      const expected = [
        "src/file.ts",
        "src/other.ts",
        resolve(cwd, "../shared/file.ts").split(sep).join("/"),
        resolve(cwd, "../shared/other.ts").split(sep).join("/")
      ];
      const calls = paths.map((path, index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: `path-${index}` },
          "read",
          { path },
          nativeAdapter("read")!,
          "historical"
        );
        coordinator.result(call, result("retained"), "success");

        return call;
      });

      for (const expanded of [false, true]) {
        for (const call of calls) coordinator.expand(call, expanded);
        calls.forEach((call, index) => {
          const rows = createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context({ cwd, expanded }))
            .render(240);
          const branch = index % 2 === 1 ? "  └" : "  ├";
          const target = expanded ? expected[index] : paths[index]!.split("/").at(-1);
          expect(rows).toContain(`${expanded ? "•" : branch} Read ${target}`);
          expect(call.args).toEqual({ path: paths[index] });
          if (index % 2 === 0 && !expanded)
            expect(rows[0]).toContain(
              `Explored ${index === 0 ? "src" : resolve(cwd, "../shared").split(sep).join("/")}`
            );
        });
      }
    } finally {
      coordinator.dispose();
    }
  });
  it.each(["bash", "powershell"])(
    "removes trailing blank %s rows without changing internal whitespace or retained output",
    (name) => {
      const samples = [
        { text: "first\nlast", lines: ["first", "last"] },
        { text: "first\nlast\n", lines: ["first", "last"] },
        { text: "first\r\nlast\r\n", lines: ["first", "last"] },
        { text: "\x1b[31mfirst\nlast\n\x1b[0m", lines: ["first", "last"] },
        { text: "first\n\nlast\n\n", lines: ["first", "", "last"] },
        { text: "last \n", lines: ["last "] },
        { text: "last\n  ", lines: ["last"] },
        { text: "last\n\x1b[0m \n\x1b[39m\n", lines: ["last"] },
        { text: "\n", lines: ["(no output)"] },
        { text: " \r\n\t\r\n", lines: ["(no output)"] }
      ];

      for (const expanded of [false, true]) {
        for (const currentTheme of [theme, semanticTheme()]) {
          for (const { text, lines } of samples) {
            const supplied = result(text);
            const current = context({ expanded });
            const rows = createToolDisplayRenderers(name, nativeAdapter(name))
              .renderResult(supplied, current, currentTheme, current)
              .render(120)
              .map(stripTerminalSequences);
            expect(rows.map((row) => row.slice(4))).toEqual(lines);
            expect(supplied).toEqual(result(text));
          }
        }
      }
    }
  );
  it("does not count trailing shell blank rows against the compact row budget", () => {
    const current = context();
    const rows = body("bash", result("one\ntwo\nthree\nfour\nfive\n\n\n"), current).render(120);
    expect(rows).toHaveLength(5);
    expect(rows.join("\n")).toContain("three");
    expect(rows.join("\n")).not.toContain("more rows");
    expect(rows.at(-1)?.trim()).toBe("five");
  });
  it("keeps only Pi's separator between complete tool cards after trailing shell blank rows", () => {
    const supplied = result(
      "RUN fixture\n\nTest Files 1 passed\nTests 1 passed\nStart at 12:00\nDuration 1s\n\n \n\x1b[0m"
    );
    const row = new ToolExecutionComponent(
      "bash",
      "shell-spacing",
      { command: "test" },
      { showImages: false },
      createToolDisplayRenderers("bash", nativeAdapter("bash")),
      renderingTui(),
      "/tmp"
    );
    const next = new ToolExecutionComponent(
      "read",
      "next-row",
      { path: "file.ts" },
      { showImages: false },
      createToolDisplayRenderers("read", nativeAdapter("read")),
      renderingTui(),
      "/tmp"
    );
    next.updateResult({ ...result("file content"), isError: false });

    for (const partial of [true, false]) {
      row.updateResult({ ...supplied, isError: false }, partial);

      for (const expanded of [false, true]) {
        row.setExpanded(expanded);
        const lines = [...row.render(120), ...next.render(120)].map(stripTerminalSequences);
        const nextHeading = lines.findIndex((line) => line.includes("Read file.ts"));
        expect(nextHeading).toBeGreaterThan(1);
        expect(lines[nextHeading - 1]).toBe("");
        expect(lines[nextHeading - 2]?.trim()).toBe("Duration 1s");
      }
    }
  });
  it("preserves final blank rows for non-shell results", () => {
    const rows = body("custom", result("last\n")).render(120);
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)?.trim()).toBe("");
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
        themed.fg("error", "Command aborted")
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
    const preview = {
      text: `${marker}\n${marker}\nretained output\n\n \n\x1b[0m`,
      // Only the second occurrence is a generated notice.
      omissions: [{ start: marker.length + 1, end: marker.length * 2 + 1 }]
    } satisfies OutputText;
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
          coordinator.setSavedOutput(call, { path: "saved-output", ...preview });
        }

        const rows = renderer
          .renderResult(result("partial result"), context(), themed, context())
          .render(120)
          .join("\n");
        expect(rows.split(themed.fg("warning", marker))).toHaveLength(2);
        expect(rows).toContain(`\x1b[37m${marker}`);
        expect(rows).not.toContain("partial result");
        expect(stripTerminalSequences(rows).endsWith("retained output")).toBe(true);
        expect(preview.text.endsWith("\n\n \n\x1b[0m")).toBe(true);
      }
    } finally {
      coordinator.dispose();
    }
  });
  it.each(["patch", "live preview", "saved output"])(
    "preserves image fallback when %s replaces retained text",
    (replacement) => {
      const images = getCapabilities().images;
      const coordinator = new TranscriptCoordinator("substituted-image-body");

      try {
        const adapter =
          replacement === "patch"
            ? { id: "owner:patch", family: "invocation" as const, patch: true }
            : nativeAdapter("bash")!;
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "image-result" },
          replacement === "patch" ? "owner_patch" : "bash",
          { command: "fixture" },
          adapter,
          "live"
        );
        const supplied = {
          content: [
            { type: "text" as const, text: "retained text" },
            { type: "image" as const, mimeType: "image/png", data: "private-image-bytes" }
          ],
          details: { patch: "@@ -1 +1 @@\n-old\n+new\n" }
        };
        const original = structuredClone(supplied);
        coordinator.result(call, supplied, "success", replacement === "live preview");
        if (replacement === "live preview")
          coordinator.preview(call, { text: "substituted output" });
        if (replacement === "saved output")
          coordinator.setSavedOutput(call, { path: "saved-output", text: "substituted output" });
        const renderer = createToolDisplayRenderers(call.name, adapter, {
          binding: { call, coordinator }
        });

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);

          for (const capability of [null, "kitty"] as const) {
            setCapabilityOverrides({ images: capability });

            for (const showImages of [false, true]) {
              const current = context({
                args: call.args,
                expanded,
                showImages,
                isPartial: replacement === "live preview"
              });
              const rows = renderer
                .renderResult(supplied, current, theme, current)
                .render(100)
                .map(stripTerminalSequences)
                .join("\n");
              expect(rows.split("[Image: image/png]")).toHaveLength(
                capability && showImages ? 1 : 2
              );
              expect(rows).not.toContain("private-image-bytes");

              if (replacement === "patch") {
                expect(rows).toContain("+1 -1");
                expect(rows).not.toContain("retained text");
              } else if (replacement === "live preview" || expanded) {
                expect(rows).toContain("substituted output");
                expect(rows).not.toContain("retained text");
              }
            }
          }
        }

        expect(supplied).toEqual(original);
      } finally {
        setCapabilityOverrides({ images });
        coordinator.dispose();
      }
    }
  );
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
        coordinator.setSavedOutput(call, { path: "saved-output", text: "complete process output" });
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
      ["grep", { pattern: "needle", path: "src" }, "needle \u2014 src", '"pattern"']
    ] as const) {
      const renderer = createPublicRenderers(name, nativeAdapter(name));
      const current = context({ args, expanded: true });
      const heading = renderer.renderCall(args, theme, current).render(80).join("\n");
      expect(heading).toContain(summary);
      expect(heading).not.toContain(key);
      const visible = createPublicRenderers(name, nativeAdapter(name), {
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
      createPublicRenderers("read", undefined, { showParameters: false })
        .renderCall(args, theme, context({ expanded: true }))
        .render(80)
        .join("\n")
    ).toContain('"path"');
  });
  it("does not read hidden parameter parts for adapters that follow the setting", () => {
    let parameterReads = 0;
    const adapter = {
      id: "owner:optional-parameters",
      family: "invocation" as const,
      invocation: () => [
        { kind: "value" as const, text: "lookup" },
        {
          kind: "parameters" as const,
          get text() {
            parameterReads++;

            return '({"query":"needle"})';
          }
        }
      ]
    };

    for (const options of [{}, { showParameters: false }]) {
      const renderer = createPublicRenderers("lookup", adapter, options);

      for (const expanded of [false, true]) {
        const header = renderer.renderCall({}, theme, context({ expanded }));
        expect(header.render(120).join("\n")).toContain("lookup");
        expect(header.render(80).join("\n")).not.toContain("needle");
      }
    }

    expect(parameterReads).toBe(0);
    const renderer = createPublicRenderers("lookup", adapter, { showParameters: true });
    expect(renderer.renderCall({}, theme, context()).render(80).join("\n")).toContain("needle");
    expect(parameterReads).toBe(1);
  });
  it("colors only FFF search patterns in grouped, expanded, and standalone summaries", () => {
    const themed = semanticTheme();

    for (const name of ["fffind", "ffgrep", "fff-multi-grep", "find", "grep", "multi_grep"]) {
      const multi = name === "fff-multi-grep" || name === "multi_grep";
      const adapter = piFffAdapter({
        name,
        description: "FFF search",
        parameters: {
          type: "object",
          properties: { [multi ? "patterns" : "pattern"]: { type: multi ? "array" : "string" } }
        },
        sourceInfo: {
          source: "npm:@ff-labs/pi-fff@0.10.6",
          path: "/fff/src/index.ts",
          scope: "user",
          origin: "package"
        }
      })!;
      const pattern = multi ? "parse_config, parseConfig" : "parse_(config|Config)";
      const scope = `src/** ${pattern}`;
      const args = Object.freeze(
        multi
          ? { patterns: Object.freeze(["parse_config", "parseConfig"]), constraints: scope }
          : { pattern, path: scope }
      );
      const coordinator = new TranscriptCoordinator("search-pattern-colors");

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: name },
          name,
          args,
          adapter,
          "historical"
        );
        const retained = result("retained matching source");
        coordinator.result(call, retained, "success");

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);

          for (const options of [{}, { binding: { call, coordinator } }]) {
            const renderer = createToolDisplayRenderers(name, adapter, options);
            const rows = renderer
              .renderCall(args, themed, context({ expanded }))
              .render(160)
              .join("\n");
            expect(stripTerminalSequences(rows)).toContain(`${pattern} \u2014 ${scope}`);
            expect(rows).toContain(themed.fg("syntaxString", pattern));
            expect(rows).toContain(themed.fg("text", scope));
            expect(rows).not.toContain('"patterns"');
          }
        }

        expect(call.args).toBe(args);
        expect(call.result).toBe(retained);

        for (const empty of multi ? [{}, { patterns: [] }] : [{}]) {
          const rows = createToolDisplayRenderers(name, adapter)
            .renderCall(empty, themed, context())
            .render(100)
            .join("\n");
          expect(rows).toContain(themed.fg("dim", multi ? "…" : "(pattern missing)"));
        }

        const native = nativeAdapter(name);

        if (native) {
          const rows = createToolDisplayRenderers(name, native)
            .renderCall(args, themed, context())
            .render(160)
            .join("\n");
          expect(rows).toContain(themed.fg("text", pattern));
          expect(rows).not.toContain(themed.fg("syntaxString", pattern));
        }
      } finally {
        coordinator.dispose();
      }
    }
  });
  it.each(
    (
      [
        [
          "ffgrep",
          { pattern: "", path: "packages/utils/src/fff-tools.ts" },
          'Searched ""',
          'Searched "" \u2014 packages/utils/src/fff-tools.ts'
        ],
        ["ffgrep", { pattern: "" }, 'Searched ""', 'Searched "" \u2014 .'],
        ["fffind", { pattern: "", path: "packages/" }, "Listed files", "Listed packages/"],
        ["fffind", { pattern: "", path: "./src/**" }, "Listed files", "Listed ./src/**"],
        ["fffind", { pattern: "" }, "Listed files", "Listed ."]
      ] as const
    ).flatMap(([name, args, compact, expanded]) =>
      [false, true].map((isExpanded) => ({ name, args, compact, expanded, isExpanded }))
    )
  )(
    "renders explicit empty $name patterns (expanded=$isExpanded, args=$args)",
    ({ name, args, compact, expanded, isExpanded }) => {
      Object.freeze(args);
      const adapter = piFffAdapter(fffToolInfo(name))!;
      const coordinator = new TranscriptCoordinator("empty-search-patterns");

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: name },
          name,
          args,
          adapter,
          "historical"
        );
        coordinator.add(
          { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
          name,
          args,
          adapter,
          "historical"
        );
        const supplied = result("retained backend output");
        for (const member of coordinator.calls.values())
          coordinator.result(member, supplied, "success");
        coordinator.expand(call, isExpanded);
        const renderer = createToolDisplayRenderers(name, adapter, {
          binding: { call, coordinator }
        });
        const current = context({ args, expanded: isExpanded });
        expect(renderer.renderCall(args, theme, current).render(120)).toEqual(
          isExpanded
            ? [`• ${expanded}`]
            : [
                `• Filtered ${"path" in args ? args.path : "."}`,
                `  ├ ${compact}`,
                "  │   retained backend output"
              ]
        );
        expect(renderer.renderResult(supplied, current, theme, current).render(120)).toEqual(
          isExpanded ? ["  └ retained backend output"] : []
        );
        const standalone = createToolDisplayRenderers(name, adapter);
        expect(standalone.renderCall(args, theme, current).render(120)).toEqual([`• ${expanded}`]);
        expect(call.args).toBe(args);
        expect(call.result).toBe(supplied);
      } finally {
        coordinator.dispose();
      }
    }
  );

  it.each(["ffgrep", "fffind"])(
    "keeps missing %s patterns distinct from explicit emptiness",
    (name) => {
      const adapter = piFffAdapter(fffToolInfo(name))!;

      for (const expanded of [false, true]) {
        const args = { path: "packages/" };
        expect(adapter.exploration?.(args)).toBeUndefined();
        expect(
          createToolDisplayRenderers(name, adapter)
            .renderCall(args, theme, context({ expanded }))
            .render(100)
        ).toEqual(["• Searched (pattern missing) \u2014 packages/"]);
      }
    }
  );

  it("omits repeated FFF scopes and operation counts while retaining every error-colored diagnostic", () => {
    const coordinator = new TranscriptCoordinator("filter-presentation", { cwd: "/tmp" });
    const themed = semanticTheme();
    const path = "src/**";

    try {
      const calls = ["ffgrep", "fffind"].map((name, index) => {
        const args = Object.freeze({ path, pattern: index === 0 ? "alpha" : "" });
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: name },
          name,
          args,
          piFffAdapter(fffToolInfo(name))!,
          "live"
        );

        return call;
      });
      const renderers = calls.map((call) =>
        createToolDisplayRenderers(call.name, call.adapter, { binding: { call, coordinator } })
      );
      expect(
        stripTerminalSequences(
          renderers[0]!.renderCall(calls[0]!.args, themed, context()).render(110)[0]!
        )
      ).toBe("• Filtering src/**");
      for (const call of calls) coordinator.result(call, result("retained diagnostic"), "failure");
      const compact = renderers.flatMap((renderer, index) =>
        renderer.renderCall(calls[index]!.args, themed, context()).render(110)
      );
      const plain = compact.map(stripTerminalSequences);
      expect(plain).toEqual([
        "• Filtered src/** · 2 failed",
        "  ├ Search failed alpha",
        "  │   retained diagnostic",
        "  └ List failed files",
        "      retained diagnostic"
      ]);
      expect(compact.join("\n")).toContain(themed.fg("error", "2 failed"));
      expect(compact.join("\n")).toContain(themed.fg("error", "Search failed"));
      expect(compact.join("\n").split(themed.fg("error", "retained diagnostic"))).toHaveLength(3);
      expect(compact.join("\n")).toContain(themed.fg("dim", "files"));
      coordinator.expand(calls[0]!, true);

      for (const [index, call] of calls.entries()) {
        const renderer = renderers[index]!;
        expect(
          stripTerminalSequences(
            renderer
              .renderCall(call.args, themed, context({ expanded: true }))
              .render(110)
              .join("\n")
          )
        ).toContain(index === 0 ? ` \u2014 ${path}` : `List failed ${path}`);
        const body = renderer
          .renderResult(
            call.result!,
            context({ expanded: true }),
            themed,
            context({ expanded: true })
          )
          .render(110)
          .join("\n");
        expect(body).toContain(themed.fg("error", "retained diagnostic"));
        expect(call.args).toEqual({ path, pattern: index === 0 ? "alpha" : "" });
        expect(call.result).toEqual(result("retained diagnostic"));
      }
    } finally {
      coordinator.dispose();
    }
  });

  it("uses the current adapter's parameter policy after late registration and generic fallback", () => {
    const adapter = piFffAdapter({
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
      const retainedHeading = renderer.renderCall(args, theme, context());
      const heading = () => retainedHeading.render(80).join("\n");
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
    const coordinator = new TranscriptCoordinator("group-notices", { cwd: "/tmp" });

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
      const heading = [first, sibling]
        .flatMap((call) =>
          createToolDisplayRenderers("read", adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context())
            .render(80)
        )
        .join("\n");
      expect(heading).toContain("├ Read a.ts");
      expect(heading).toContain("└ Read b.ts");
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
  it("keeps failed read and FFF diagnostics visible across standalone scope runs", () => {
    const coordinator = new TranscriptCoordinator("group-failures");

    try {
      const adapters = [
        nativeAdapter("read")!,
        piFffAdapter({
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
      const heading = [first, ...failures]
        .flatMap((call) => {
          const renderer = createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          });

          return [
            ...renderer.renderCall(call.args, theme, context()).render(100),
            ...renderer.renderResult(call.result!, context(), theme, context()).render(100)
          ];
        })
        .join("\n");
      expect(heading).toContain("Read failed");
      expect(heading).toContain("Search failed");
      expect(heading).not.toContain("Explored");
      for (const diagnostic of diagnostics) expect(heading).toContain(diagnostic);
      expect(heading).not.toContain("successful body stays hidden");

      for (const call of failures) {
        const renderer = createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        });
        const current = context({ args: call.args, isError: true });
        expect(
          renderer.renderResult(call.result!, current, theme, current).render(100).join("\n")
        ).toContain(diagnostics[failures.indexOf(call)]!);
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

  it.each([false, true])(
    "shows FFF pagination in standalone and grouped cards (expanded=%s)",
    (expanded) => {
      const adapter = piFffAdapter({
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
      const args = { pattern: "renderers", path: "src/" };
      const notice = '[32 more matches available. cursor="3" to continue]';
      const supplied = {
        ...result(`renderers.ts\n\n${notice}`),
        details: { totalMatched: 33, totalFiles: 33, pageIndex: 2, hasMore: true }
      };
      const current = context({ args, expanded });
      const renderer = createToolDisplayRenderers("fffind", adapter);
      const standalone = renderer
        .renderResult(supplied, current, theme, current)
        .render(100)
        .join("\n");
      expect(standalone.includes("renderers.ts")).toBe(expanded);
      expect(standalone).toContain("33 matching files");
      expect(standalone.includes("33 indexed files")).toBe(expanded);
      expect(standalone.split(notice)).toHaveLength(2);
      expect(standalone).not.toContain("Page ");
      expect(
        renderer.renderResult(result(notice), current, theme, current).render(100).join("\n")
      ).toContain(notice);
      const generic = createToolDisplayRenderers("fffind")
        .renderResult(supplied, current, theme, current)
        .render(100)
        .join("\n");
      expect(generic).toContain(notice);
      const coordinator = new TranscriptCoordinator("visible-pagination");

      try {
        const search = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "search" },
          "fffind",
          args,
          adapter,
          "historical"
        );
        const sibling = coordinator.add(
          { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
          "fffind",
          { pattern: "cards", path: "src/" },
          adapter,
          "historical"
        );
        coordinator.result(sibling, result("retained sibling matches"), "success");
        coordinator.result(search, supplied, "success");
        coordinator.expand(search, expanded);
        const rows = [search, sibling].flatMap((call) => {
          const renderer = createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          });

          return [
            ...renderer.renderCall(call.args, theme, current).render(100),
            ...renderer.renderResult(call.result!, current, theme, current).render(100)
          ];
        });
        expect(rows.join("\n").split(notice)).toHaveLength(2);
        expect(rows.join("\n")).not.toContain("Page ");
        if (expanded) {
          expect(rows.join("\n")).toContain("renderers.ts");
          expect(rows.join("\n")).toContain("retained sibling matches");
        } else
          expect(rows).toEqual([
            "• Filtered src/",
            "  ├ Searched renderers",
            "  │   33 matching files",
            `  │   ${notice}`,
            "  └ Searched cards",
            "      retained sibling matches"
          ]);
        expect(search.result).toBe(supplied);
        expect(supplied.content[0]).toEqual({ type: "text", text: `renderers.ts\n\n${notice}` });
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("shows compact FFF output excerpts under grouped calls", () => {
    const coordinator = new TranscriptCoordinator("grouped-fff-output");
    const adapter = piFffAdapter(fffToolInfo("ffgrep"))!;
    const calls = [
      ["setWorkingMessage", "src/state.ts\n 12: setWorkingMessage"],
      ["working", "src/messages.ts\n 4: working"]
    ] as const;

    try {
      const members = calls.map(([pattern, output], index) => {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: `grouped-${index}` },
          "ffgrep",
          { pattern, path: "." },
          adapter,
          "historical"
        );
        coordinator.result(call, result(output), "success");

        return call;
      });
      const rows = members.flatMap((call) =>
        createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        })
          .renderCall(call.args, theme, context())
          .render(100)
          .map(stripTerminalSequences)
      );

      expect(rows).toEqual([
        "• Filtered .",
        "  ├ Searched setWorkingMessage",
        "  │   src/state.ts",
        "  │    12: setWorkingMessage",
        "  └ Searched working",
        "      src/messages.ts",
        "       4: working"
      ]);
    } finally {
      coordinator.dispose();
    }
  });

  it("keeps wrapped FFF diagnostics immediately under their source-ordered calls", () => {
    const coordinator = new TranscriptCoordinator("notice-ownership");

    try {
      const search = piFffAdapter({
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
      const calls = [
        ["fffind", { pattern: "a", path: "src/" }, search],
        ["fffind", { pattern: "renderers", path: "src/" }, search],
        ["fffind", { pattern: "a", path: "src/" }, search]
      ] as const;
      const members = calls.map(([name, args, adapter], index) =>
        coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: `ordered-${index}` },
          name,
          args,
          adapter,
          "historical"
        )
      );
      const notice =
        '[Query "renderers" produced only weak scattered fuzzy matches. Output capped at 5/100.]';
      // Completion order must not decide visual ownership or branch endings.
      coordinator.result(members[2]!, result("last file contents"), "success");
      coordinator.result(members[1]!, result(`renderers.ts\n\n${notice}`), "success");
      coordinator.result(members[0]!, result("first file contents"), "success");

      for (const width of [34, 100]) {
        const rendered = members.map((call) =>
          createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context())
            .render(width)
        );
        expect(rendered[0]).toEqual([
          "• Filtered src/",
          "  ├ Searched a",
          "  │   first file contents"
        ]);
        expect(rendered[1]![0]).toBe("  ├ Searched renderers");
        expect(rendered[1]!.slice(1).every((row) => row.startsWith("  │   "))).toBe(true);
        expect(
          rendered[1]!
            .slice(1)
            .map((row) => row.slice(6))
            .join(" ")
        ).toContain("only weak scattered fuzzy matches");
        expect(rendered[2]).toEqual(["  └ Searched a", "      last file contents"]);
        expect(rendered.flat().every((row) => visibleWidth(row) <= width)).toBe(true);
      }
    } finally {
      coordinator.dispose();
    }
  });

  it("retains multiline FFF query warnings in collapsed exploration", () => {
    const coordinator = new TranscriptCoordinator("multiline-query-warning");

    try {
      const adapter = piFffAdapter(fffToolInfo("fffind"))!;
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "multiline" },
        "fffind",
        { pattern: "foo\nbar" },
        adapter,
        "historical"
      );
      coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
        "fffind",
        { pattern: "other" },
        adapter,
        "historical"
      );
      const warning =
        '[Query "foo\nbar" produced only weak scattered fuzzy matches. Output capped at 1/10.]';
      const supplied = result(`src/example.ts\n\n${warning}`);
      coordinator.result(call, supplied, "success");
      const renderer = createToolDisplayRenderers("fffind", adapter, {
        binding: { call, coordinator }
      });
      const compact = renderer
        .renderCall(call.args, theme, context())
        .render(100)
        .map(stripTerminalSequences)
        .join("\n");
      expect(compact).toContain("weak scattered fuzzy matches");
      expect(compact).toContain("Output capped at 1/10.");
      expect(compact).toContain("src/example.ts");
      coordinator.expand(call, true);
      const current = context({ args: call.args, expanded: true });
      const expanded = renderer
        .renderResult(supplied, current, theme, current)
        .render(100)
        .map(stripTerminalSequences)
        .join("\n");
      expect(expanded).toContain("src/example.ts");
      expect(expanded).toContain("weak scattered fuzzy matches");
      expect(supplied).toEqual(result(`src/example.ts\n\n${warning}`));
    } finally {
      coordinator.dispose();
    }
  });

  it.each(["edit", "write"])(
    "keeps a failed %s patch and related diagnostics in one result item",
    (name) => {
      const coordinator = new TranscriptCoordinator("change-tree");

      try {
        const adapter = nativeAdapter(name)!;
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "failed" },
          name,
          { path: "a.txt" },
          adapter,
          "historical"
        );
        coordinator.fact(call, {
          kind: "change",
          availability: "available",
          patch: "@@ -1 +1 @@\n-before\n+after\n"
        });
        coordinator.fact(call, {
          kind: "operation",
          availability: "available",
          outcome: "failure",
          durationMs: 12
        });
        const supplied = result("Permission denied");
        coordinator.result(call, supplied, "failure");
        const renderer = createToolDisplayRenderers(name, adapter, {
          binding: { call, coordinator }
        });

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);
          const current = context({ args: call.args, isError: true, expanded });
          const rows = renderer
            .renderResult(supplied, current, theme, current)
            .render(100)
            .map(stripTerminalSequences);
          expect(rows.filter((row) => /^  [├└] /.test(row))).toEqual(["  └ +1 -1"]);
          const proposalIndex = rows.findIndex((row) => row.includes("Proposed change"));
          expect(proposalIndex).toBeGreaterThanOrEqual(0);
          expect(proposalIndex).toBeLessThan(rows.findIndex((row) => row.includes("1 -before")));
          for (const detail of ["Failed to apply change", "Permission denied"])
            expect(rows.some((row) => row.startsWith("    ") && row.includes(detail))).toBe(true);
        }
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("avoids redundant native image descriptions without removing generic text or native warnings", () => {
    const supplied = {
      content: [
        {
          type: "text" as const,
          text: "Read image file [image/png]\n[Current model does not support images. The image will be omitted from this request.]"
        },
        { type: "image" as const, mimeType: "image/png", data: "private-image-bytes" }
      ],
      details: undefined
    };
    const original = structuredClone(supplied);
    const current = context({ expanded: true, showImages: false });
    const native = body("read", supplied, current).render(100).join("\n");
    expect(native.match(/image\/png/g)).toHaveLength(1);
    expect(native).toContain("Current model does not support images");
    const generic = createToolDisplayRenderers("read")
      .renderResult(supplied, current, theme, current)
      .render(100)
      .join("\n");
    expect(generic.match(/image\/png/g)).toHaveLength(2);
    expect(supplied).toEqual(original);
  });

  it.each([
    {
      warning:
        "[Current model does not support images. The image will be omitted from this request.]",
      image: true
    },
    {
      warning: "[Image omitted: could not be converted to a supported inline image format.]",
      image: false
    },
    {
      warning: "[Image omitted: could not be resized below the inline image size limit.]",
      image: false
    }
  ])(
    "retains native image warning $warning in compact and expanded reads",
    ({ warning, image }) => {
      const supplied: AgentToolResult<unknown> = {
        content: [
          { type: "text", text: `Read image file [image/png]\n${warning}` },
          ...(image
            ? [{ type: "image" as const, mimeType: "image/png", data: "private-image-bytes" }]
            : [])
        ],
        details: undefined
      };
      const original = structuredClone(supplied);
      const coordinator = new TranscriptCoordinator("image-warning");

      try {
        const adapter = nativeAdapter("read")!;
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "image-warning" },
          "read",
          { path: "image.png" },
          adapter,
          "historical"
        );
        coordinator.result(call, supplied, "success");

        for (const grouped of [false, true]) {
          const renderer = createToolDisplayRenderers(
            "read",
            adapter,
            grouped ? { binding: { call, coordinator } } : {}
          );

          for (const expanded of [false, true]) {
            coordinator.expand(call, expanded);
            const current = context({ args: call.args, expanded, showImages: false });
            const rows = [
              ...renderer.renderCall(call.args, theme, current).render(180),
              ...renderer.renderResult(supplied, current, theme, current).render(180)
            ]
              .map(stripTerminalSequences)
              .join("\n");
            expect(rows.split(warning)).toHaveLength(2);
            expect(rows).not.toContain("private-image-bytes");
            expect(rows).not.toContain("failed");
          }
        }

        expect(supplied).toEqual(original);
      } finally {
        coordinator.dispose();
      }
    }
  );

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
    const source = Array.from({ length: 30 }, (_, index) => `row ${index}`).join("\n");
    const value = result(source);
    expect(body("bash", value).render(80)).toHaveLength(5);
    const expanded = body("bash", value, context({ expanded: true }));
    expect(expanded.render(80)).toHaveLength(30);
    expect(expanded.render(10).every((row) => visibleWidth(row) <= 10)).toBe(true);
    expect(value).toEqual(result(source));
  });

  it("shows observation limitations only when no usable patch is available", () => {
    const coordinator = new TranscriptCoordinator("patch-precedence");

    try {
      const adapter = nativeAdapter("edit")!;
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "edit" },
        "edit",
        { path: "file.ts" },
        adapter,
        "historical"
      );
      coordinator.fact(call, {
        kind: "change",
        availability: "unavailable",
        reason: "Change exceeds the diff computation budget."
      });
      const renderer = createToolDisplayRenderers("edit", adapter, {
        binding: { call, coordinator }
      });

      for (const patch of ["@@ -1 +1 @@\n-old\n+new\n", "invalid", ""]) {
        const supplied = { ...result("Successfully edited file.ts"), details: { patch } };
        coordinator.result(call, supplied, "success");
        const current = context({ args: call.args });
        const text = stripTerminalSequences(
          renderer.renderResult(supplied, current, theme, current).render(80).join("\n")
        );
        expect(text.includes("diff computation budget")).toBe(!patch.startsWith("@@"));
        if (patch.startsWith("@@")) expect(text).toContain("+new");
      }

      coordinator.fact(call, {
        kind: "change",
        availability: "available",
        patch: "@@ -1 +1 @@\n-observed-before\n+observed-after\n"
      });
      const replaced = { ...result("Middleware result"), details: { patch: "invalid" } };
      coordinator.result(call, replaced, "success");
      const current = context({ args: call.args });
      const replacementText = stripTerminalSequences(
        renderer.renderResult(replaced, current, theme, current).render(80).join("\n")
      );
      expect(replacementText).toContain("+observed-after");
      expect(replacementText).not.toContain("Patch display unavailable");
    } finally {
      coordinator.dispose();
    }
  });

  it("applies the patch limit before terminal normalization", () => {
    const patch = `@@ -1 +1 @@\n-${"\x1b[31m".repeat(30_000)}before\n+after\n`;
    const rendered = body(
      "edit",
      { ...result("Successfully edited file.ts"), details: { patch } },
      context({ args: { path: "file.ts" } })
    )
      .render(80)
      .map(stripTerminalSequences)
      .join("\n");

    expect(rendered).toContain("Patch display unavailable: invalid or oversized patch.");
  });

  it.each([
    ["overwrites", "@@ -1 +1 @@\n-before\n+after\n", 1, 1, "+1 -1"],
    ["additions", "@@ -0,0 +1 @@\n+after\n", 1, 0, undefined],
    ["deletions", "@@ -1 +0,0 @@\n-before\n", 0, 1, undefined],
    ["no changes", "--- a\n+++ b\n", 0, 0, "+0 -0"]
  ] as const)(
    "keeps edit counts while hiding only one-sided write counts for patches with %s",
    (_, patch, added, removed, summary) => {
      const coordinator = new TranscriptCoordinator("write-layout");

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "write" },
          "write",
          { path: "example.txt", content: added ? "after\n" : "" },
          nativeAdapter("write")!,
          "historical"
        );
        coordinator.fact(call, {
          kind: "change",
          availability: "available",
          change: "modification",
          patch
        });
        coordinator.fact(call, {
          kind: "operation",
          availability: "available",
          outcome: "success",
          durationMs: 1
        });
        const supplied = result(`Successfully wrote ${added ? 6 : 0} bytes to example.txt`);
        coordinator.result(call, supplied, "success");
        const renderer = createToolDisplayRenderers(call.name, call.adapter, {
          binding: { call, coordinator }
        });

        for (const expanded of [false, true]) {
          coordinator.expand(call, expanded);
          const current = context({ args: call.args, expanded });
          const components = [
            [renderer.renderResult(supplied, current, theme, current), summary],
            [
              body(
                "edit",
                { ...result("Successfully edited example.txt"), details: { patch } },
                current
              ),
              `+${added} -${removed}`
            ]
          ] as const;

          for (const [component, expectedSummary] of components) {
            for (const width of [80, 120, 240]) {
              const rows = component.render(width).map(stripTerminalSequences);
              const text = rows.join("\n");

              if (expectedSummary) expect(rows[0]).toBe(`  └ ${expectedSummary}`);
              else {
                expect(text).not.toContain(`+${added} -${removed}`);
                expect(rows[0]?.trimEnd()).toBe(`  └ 1 ${added ? "+after" : "-before"}`);
              }

              if (added) expect(text).toContain("1 +after");
              if (removed) expect(text).toContain("1 -before");

              if (added && removed && width >= 120)
                expect(rows.find((row) => row.includes("1 -before"))).toMatch(
                  /1 -before\s+│ 1 \+after/
                );
              else {
                expect(text).not.toContain("│");
                if (added && removed)
                  expect(text.indexOf("1 -before")).toBeLessThan(text.indexOf("1 +after"));
              }

              expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
            }
          }
        }
      } finally {
        coordinator.dispose();
      }
    }
  );

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
      "cancelled",
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
      const themed = semanticTheme();
      const color = {
        "transport-error": "error",
        "returned-error": "error",
        cancelled: "warning",
        success: "toolOutput",
        unavailable: "toolOutput"
      }[outcome];

      for (const expanded of [false, true]) {
        const current = context({ expanded });
        const styled = renderer
          .renderResult(supplied, current, themed, current)
          .render(80)
          .join("\n");
        for (const text of ["before", "after"])
          expect(styled, `${outcome}: ${text}, expanded=${expanded}`).toContain(
            themed.fg(color, text)
          );
        expect(styled).toContain(themed.fg("dim", "Resource: "));
        expect(styled).toContain(themed.fg("text", "file:///resource"));
        const rows = stripTerminalSequences(styled);
        const branches = rows.split("\n").filter((row) => /^  [├└] /.test(row));
        expect(branches).toHaveLength(3);
        expect(branches.map((row) => row.slice(0, 4))).toEqual(["  ├ ", "  ├ ", "  └ "]);
        expect(rows.indexOf("before")).toBeLessThan(rows.indexOf("Media"));
        expect(rows.indexOf("Media")).toBeLessThan(rows.indexOf("after"));
        expect(rows.includes("Transport error")).toBe(outcome === "transport-error");
        expect(rows.includes("Tool returned an error")).toBe(outcome === "returned-error");
        expect(rows).not.toContain("private");
      }
    }
  });

  it("retains owner-supplied patches alongside independent typed MCP results", () => {
    const renderer = createToolDisplayRenderers("edit_proxy", {
      id: "owner:patch-and-mcp",
      family: "invocation",
      patch: true,
      mcp: () => ({
        server: "files",
        tool: "edit",
        outcome: "success",
        content: [{ type: "text", text: "Owner diagnostic" }]
      })
    });
    const supplied = {
      ...result("retained result"),
      details: { patch: "@@ -1 +1 @@\n-before\n+after\n" }
    };
    const current = context();
    const rows = renderer
      .renderResult(supplied, current, theme, current)
      .render(80)
      .map(stripTerminalSequences);
    expect(rows[0]).toBe("  ├ +1 -1");
    expect(rows.some((row) => row.startsWith("  │ ") && row.includes("+after"))).toBe(true);
    expect(rows.at(-1)).toBe("  └ Owner diagnostic");
  });

  it("treats adapter-provided heading text as plain terminal text", () => {
    const control = "\x1b]52;c;YQ==\x07";
    const adapter: ToolDisplayAdapter = {
      id: "custom:plain-headings",
      family: "invocation",
      groupTitle: `Tasks${control}`,
      headingVerbs: () => ({
        action: `Check${control}`,
        pending: `Checking${control}`,
        complete: `Checked${control}`
      }),
      exploration: () => [
        {
          parts: [{ kind: "value", text: "item" }],
          scope: { kind: "filter", value: "custom:plain-headings" }
        }
      ]
    };
    const standalone = createPublicRenderers("custom", adapter)
      .renderCall({}, theme, context())
      .render(80)
      .join("\n");
    expect(standalone).toContain("Checked");
    expect(standalone).not.toContain("\x1b");

    const coordinator = new TranscriptCoordinator("plain-headings");

    try {
      const first = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" },
        "custom",
        {},
        adapter,
        "historical"
      );
      coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "second" },
        "custom",
        {},
        adapter,
        "historical"
      );
      const grouped = createToolDisplayRenderers("custom", adapter, {
        binding: { call: first, coordinator }
      })
        .renderCall({}, theme, context())
        .render(80)
        .join("\n");
      expect(grouped).toContain("Tasks");
      expect(grouped).toContain("Check");
      expect(grouped).not.toContain("\x1b");
    } finally {
      coordinator.dispose();
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
    const factsByDetails = new Map<unknown, McpFacts>();
    const renderer = createToolDisplayRenderers("proxy", {
      id: "owner:mcp-result",
      family: "invocation",
      mcp: (_args, supplied) => factsByDetails.get(supplied?.details)
    });
    let errorMarker = "",
      successMarker = "";
    const themed: ToolDisplayRenderers = {
      ...renderer,
      renderCall(args, theme, context) {
        errorMarker = theme.fg("error", "•");
        successMarker = theme.fg("accent", "•");

        return renderer.renderCall(args, theme, context);
      }
    };

    const createRow = (id: string, outcome: McpFacts["outcome"], tool: string) => {
      const row = new ToolExecutionComponent("proxy", id, {}, {}, themed, renderingTui(), "/tmp");
      const details: McpFacts = {
        server: "docs",
        tool,
        outcome,
        content: [{ type: "text", text: "typed result" }]
      };
      factsByDetails.set(details, details);
      row.updateResult({
        content: [{ type: "text", text: "flattened result" }],
        details,
        isError: false
      });

      return row;
    };

    const failed = createRow("failed", "returned-error", "search");
    const successful = createRow("successful", "success", "list");
    failed.invalidate();
    const failedRows = failed.render(80).join("\n");
    expect(stripTerminalSequences(failedRows)).toContain("Call failed docs.search");
    expect(stripTerminalSequences(failedRows)).not.toContain("docs.search(");
    expect(errorMarker).not.toBe(successMarker);
    expect(failedRows).toContain(errorMarker);
    const successfulRows = successful.render(80).join("\n");
    expect(stripTerminalSequences(successfulRows)).toContain("Called docs.list");
    expect(successfulRows).toContain(successMarker);
  });

  it.each([48, 80, 110])(
    "retains scoped filenames, expanded paths and dim atomic ranges at %i columns",
    (width) => {
      const coordinator = new TranscriptCoordinator("path-wrapping", { cwd: "/tmp" });
      const directory = ".tmp/pi-tool-display-scope-runs-20260917-154954-1015792/a";
      const names = [
        "space name.txt",
        "unicode-☃.txt",
        `${"界é👩‍💻".repeat(20)}.txt`,
        "this-is-a-deliberately-long-filename-for-wrapping-and-tree-connectors.txt"
      ];

      try {
        const calls = names.map((name, index) => {
          const call = coordinator.add(
            { messageTimestamp: 1, contentIndex: index, toolCallId: name },
            "read",
            { path: `${directory}/${name}`, offset: 15, limit: 2 },
            nativeAdapter("read")!,
            "historical"
          );
          coordinator.result(call, result("retained"), "success");

          return call;
        });

        for (const call of calls) {
          const renderer = createToolDisplayRenderers("read", call.adapter, {
            binding: { call, coordinator }
          });

          for (const expanded of [false, true]) {
            coordinator.expand(call, expanded);
            const rows = renderer.renderCall(call.args, theme, context({ expanded })).render(width);
            expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
            expect(rows.some((row) => row.endsWith(":15-16"))).toBe(true);
            expect(
              renderer
                .renderCall(call.args, semanticTheme(), context({ expanded }))
                .render(width)
                .join("\n")
            ).toContain(semanticTheme().fg("dim", ":15-16"));
            expect(rows.join("\n")).not.toContain("more rows");
            const start = rows.findIndex((row) => /Read /.test(row));
            expect(start).toBeGreaterThanOrEqual(0);
            const indent = rows[start]!.indexOf("Read ") + 5;
            const path = rows
              .slice(start)
              .map((row) => row.slice(indent))
              .join("");
            expect(path).toBe(
              `${expanded ? `${directory}/` : ""}${call.reference.toolCallId}:15-16`
            );
          }
        }
      } finally {
        coordinator.dispose();
      }
    }
  );

  it("bounds pathological compact targets without losing their tail and restores them on expansion", () => {
    const path = `root/${"é".repeat(10000)}/final.txt`;
    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));

    for (const expanded of [false, true]) {
      const rows = renderer
        .renderCall({ path, offset: 15, limit: 2 }, theme, context({ expanded }))
        .render(48);
      expect(rows.every((row) => visibleWidth(row) <= 48)).toBe(true);
      const target = rows.map((row) => row.slice(7)).join("");
      expect(target).toMatch(/^root\//);
      expect(target).toMatch(/\/final\.txt:15-16$/);

      if (expanded) expect(target).toBe(`${path}:15-16`);
      else {
        expect(target).toContain("…");
        expect(target.length).toBeLessThanOrEqual(16384);
      }
    }
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
