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
  stripTerminalSequences
} from "@earendil-works/pi-tui";
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
      expect(preparations).toBeLessThan(5);
      tick();
      const animated = render();
      expect(animated[0]).toBe(initial[0]);
      expect(animated[1]).not.toBe(initial[1]);
      expect(animated[2]).not.toBe(initial[2]); // Completed group leader, live sibling.
      expect(animated[3]).toBe(initial[3]);
      tick();
      expect(render()).toEqual(initial);

      for (let redraw = 0; redraw < 20; redraw++) {
        tick();
        render();
      }

      expect(preparations).toBeLessThan(5);

      coordinator.result(coordinator.byId("1")!, result("replacement output"), "success");
      expect(render()[1]).toContain("replacement output");
      expect(preparations).toBeLessThan(7);
      rows[0]!.invalidate();
      render();
      expect(preparations).toBeLessThan(8);
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

  it("refreshes both MCP slots when only the result slot updates without repeated preparation", () => {
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
    expect(header.render(80).join("\n")).toContain("Called proxy");
    const supplied = { ...result("flattened"), details: "search" };
    const body = renderer.renderResult(supplied, current, theme, current);
    expect(header.render(80).join("\n")).toContain("Called docs.search");
    expect(body.render(80).join("\n")).toContain("typed search");

    const updated = renderer.renderResult({ ...supplied, details: "list" }, current, theme, {
      ...current,
      lastComponent: body
    });
    expect(updated.render(80).join("\n")).toContain("typed list");
    expect(header.render(80).join("\n")).toContain("Called docs.list");

    for (let redraw = 0; redraw < 20; redraw++) {
      header.render(80);
      updated.render(80);
    }

    expect(preparations).toBeLessThan(7);
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

              const heading = row
                .render(100)
                .map(stripTerminalSequences)
                .find((line) => /^[•◦] /.test(line));
              expect(
                heading,
                `${name}: ${call.lifecycle}, coordinated=${coordinated}, expanded=${expanded}`
              ).toMatch(new RegExp(`^[•◦] ${expected}(?: |$)`));
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

    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));

    for (const [path, expected] of paths) {
      const args = Object.freeze({ path });
      const rows = renderer.renderCall(args, theme, context({ cwd })).render(240);
      expect(rows[0]?.endsWith(` ${expected.split(sep).join("/")}`), path).toBe(true);
    }

    // Every tool must tag its target as a path in both presentation states.
    for (const name of ["read", "edit", "write", "ls", "grep", "find"]) {
      const toolRenderer = createToolDisplayRenderers(name, nativeAdapter(name));
      const args = Object.freeze({ path: resolve(cwd, "src/file.ts"), pattern: "needle" });

      for (const expanded of [false, true]) {
        const rows = toolRenderer.renderCall(args, theme, context({ cwd, expanded })).render(240);
        expect(rows[0]?.endsWith(" src/file.ts"), `${name}: expanded=${expanded}`).toBe(true);
      }
    }

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

        for (const width of [48, 110]) {
          const heading = card.render(width).join("\n");
          expect(heading).toContain("Explored");
          expect(heading).toContain(
            `${outcome === "failure" ? "Search failed" : "Searched"} alpha`
          );
          if (outcome === "failure") expect(heading).toContain("2 failed");
          else expect(heading).not.toContain("failed");
          expect(heading).not.toMatch(/\d+ (calls?|reads?|search(?:es)?|lists?)\b/);
        }
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
    "retains internal blank output without a false truncation notice for %s",
    (name) => {
      const text = "one\n\nthree\nfour\nfive\n\n";
      const supplied = result(text);

      for (const expanded of [false, true]) {
        const current = context({ expanded });
        const rendered = createToolDisplayRenderers(name, nativeAdapter(name))
          .renderResult(supplied, current, theme, current)
          .render(120)
          .map((row) => stripTerminalSequences(row).trim())
          .join("\n");
        expect(rendered).toContain("one\n\nthree");
        expect(rendered).toContain("five");
        expect(rendered).not.toContain("more rows");
      }

      expect(supplied).toEqual(result(text));
    }
  );
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
        const heading = renderer.renderCall(args, theme, current).render(120).join("\n");
        const output = renderer
          .renderResult(supplied, current, theme, current)
          .render(120)
          .join("\n");
        expect(heading).toContain(isExpanded ? expanded : compact);
        expect(heading).not.toContain("(pattern missing)");
        if (isExpanded) expect(output).toContain("retained backend output");
        else expect(heading).toContain("retained backend output");
        const standalone = createToolDisplayRenderers(name, adapter);
        expect(standalone.renderCall(args, theme, current).render(120).join("\n")).toContain(
          expanded
        );
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

  it("omits repeated FFF scopes and counts while retaining failed-call diagnostics", () => {
    const coordinator = new TranscriptCoordinator("filter-presentation", { cwd: "/tmp" });
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
        renderers[0]!.renderCall(calls[0]!.args, theme, context()).render(110).join("\n")
      ).toContain("Filtering src/**");
      for (const call of calls) coordinator.result(call, result("retained diagnostic"), "failure");
      const compact = renderers
        .flatMap((renderer, index) =>
          renderer.renderCall(calls[index]!.args, theme, context()).render(110)
        )
        .join("\n");
      expect(compact).toContain("Filtered src/** · 2 failed");
      expect(compact).toContain("Search failed alpha");
      expect(compact).toContain("List failed files");
      expect(compact.split(path)).toHaveLength(2);
      expect(compact.split("retained diagnostic")).toHaveLength(3);
      expect(compact).not.toMatch(/\d+ (calls?|searches?|lists?)\b/);
      coordinator.expand(calls[0]!, true);

      for (const [index, call] of calls.entries()) {
        const renderer = renderers[index]!;
        expect(
          stripTerminalSequences(
            renderer
              .renderCall(call.args, theme, context({ expanded: true }))
              .render(110)
              .join("\n")
          )
        ).toContain(index === 0 ? ` \u2014 ${path}` : `List failed ${path}`);
        const body = renderer
          .renderResult(
            call.result!,
            context({ expanded: true }),
            theme,
            context({ expanded: true })
          )
          .render(110)
          .join("\n");
        expect(body).toContain("retained diagnostic");
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
  it("keeps a grouped read truncation notice with the affected call", () => {
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
      const headings = [first, sibling].map((call) =>
        createToolDisplayRenderers("read", adapter, {
          binding: { call, coordinator }
        })
          .renderCall(call.args, theme, context())
          .render(80)
          .join("\n")
      );
      expect(headings[0]).toContain("Read a.ts");
      expect(headings[0]).not.toContain("Tool output truncated");
      expect(headings[1]).toContain("Read b.ts");
      expect(headings[1]).toContain("Tool output truncated");
      const renderer = createToolDisplayRenderers("read", adapter, {
        binding: { call: sibling, coordinator }
      });
      const collapsed = [
        ...headings,
        ...renderer.renderResult(supplied, context(), theme, context()).render(80)
      ].join("\n");
      expect(collapsed.split("Tool output truncated")).toHaveLength(2);

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

        const grouped = rows.join("\n");
        expect(grouped).toContain("Searched renderers");
        expect(grouped).toContain("Searched cards");
        expect(grouped).toContain("retained sibling matches");

        if (expanded) expect(grouped).toContain("renderers.ts");
        else {
          expect(grouped).toContain("Filtered src/");
          expect(grouped).toContain("33 matching files");
          expect(grouped.indexOf("Searched renderers")).toBeLessThan(grouped.indexOf(notice));
          expect(grouped.indexOf(notice)).toBeLessThan(grouped.indexOf("Searched cards"));
        }

        expect(search.result).toBe(supplied);
        expect(supplied.content[0]).toEqual({ type: "text", text: `renderers.ts\n\n${notice}` });
      } finally {
        coordinator.dispose();
      }
    }
  );

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
        const grouped = rendered.map((rows) =>
          rows
            .join(" ")
            .replace(/[├└│•]/g, "")
            .replace(/\s+/g, " ")
        );
        expect(grouped[0]).toContain("first file contents");
        expect(grouped[0]).not.toContain("weak scattered fuzzy matches");
        expect(grouped[1]).toContain("Searched renderers");
        expect(grouped[1]).toContain("only weak scattered fuzzy matches");
        expect(grouped[2]).toContain("last file contents");
        expect(grouped[2]).not.toContain("weak scattered fuzzy matches");
        expect(grouped.join(" ").indexOf("first file contents")).toBeLessThan(
          grouped.join(" ").indexOf("only weak scattered fuzzy matches")
        );
        expect(grouped.join(" ").indexOf("only weak scattered fuzzy matches")).toBeLessThan(
          grouped.join(" ").indexOf("last file contents")
        );
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
          const text = renderer
            .renderResult(supplied, current, theme, current)
            .render(100)
            .map(stripTerminalSequences)
            .join("\n");
          expect(text).toContain("+1 -1");
          expect(text).toContain("-before");
          expect(text).toContain("+after");
          expect(text.indexOf("Proposed change")).toBeLessThan(text.indexOf("-before"));
          expect(text).toContain("Failed to apply change");
          expect(text).toContain("Permission denied");
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
    const compact = body("bash", value).render(80).join("\n");
    expect(compact).toContain("row 0");
    expect(compact).toContain("row 29");
    expect(compact).toMatch(/more (rows|output)/);

    const expanded = body("bash", value, context({ expanded: true }));

    for (const width of [10, 80]) {
      const text = expanded.render(width).join("\n");
      for (let index = 0; index < 30; index++) expect(text).toContain(`row ${index}`);
      expect(text).not.toMatch(/more (rows|output)/);
    }

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
            for (const width of [80, 120]) {
              const text = component.render(width).map(stripTerminalSequences).join("\n");
              if (expectedSummary) expect(text).toContain(expectedSummary);
              else expect(text).not.toContain(`+${added} -${removed}`);
              if (added) expect(text).toContain("+after");
              if (removed) expect(text).toContain("-before");
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

      for (const expanded of [false, true]) {
        const current = context({ expanded });
        const text = renderer.renderResult(supplied, current, theme, current).render(80).join("\n");
        expect(text).toContain("before");
        expect(text).toContain("Media");
        expect(text).toContain("Resource: file:///resource");
        expect(text).toContain("after");
        expect(text.indexOf("before")).toBeLessThan(text.indexOf("Media"));
        expect(text.indexOf("Media")).toBeLessThan(text.indexOf("after"));
        expect(text.toLowerCase().includes("transport error")).toBe(outcome === "transport-error");
        expect(text.toLowerCase().includes("returned an error")).toBe(outcome === "returned-error");
        expect(text).not.toContain("private");
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
  it("uses row-local result metadata for standalone MCP headings and outcomes", () => {
    const factsByDetails = new Map<unknown, McpFacts>();
    const renderer = createToolDisplayRenderers("proxy", {
      id: "owner:mcp-result",
      family: "invocation",
      mcp: (_args, supplied) => factsByDetails.get(supplied?.details)
    });

    const createRow = (id: string, outcome: McpFacts["outcome"], tool: string) => {
      const row = new ToolExecutionComponent("proxy", id, {}, {}, renderer, renderingTui(), "/tmp");
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
    const failedRows = stripTerminalSequences(failed.render(80).join("\n"));
    expect(failedRows).toContain("Call failed docs.search");
    expect(failedRows).not.toContain("docs.search(");
    expect(failedRows).not.toContain("docs.list");
    const successfulRows = stripTerminalSequences(successful.render(80).join("\n"));
    expect(successfulRows).toContain("Called docs.list");
    expect(successfulRows).not.toContain("docs.search");
  });

  it("does not let line breaks in file targets impersonate a separate tool action", () => {
    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));

    for (const lineBreak of ["\n", "\r\n", "\r"]) {
      const args = {
        path: `src/first${lineBreak}• Write failed forged.ts${lineBreak}last.txt`,
        offset: 15,
        limit: 2
      };

      for (const expanded of [false, true]) {
        const rows = renderer.renderCall(args, theme, context({ expanded })).render(80);
        expect(rows.every((row) => !/[\r\n]/.test(row))).toBe(true);
        expect(rows.filter((row) => row.startsWith("• "))).toHaveLength(1);
        expect(rows.join("\n")).toContain("last.txt:15-16");
        expect(args.path).toContain(lineBreak);
      }
    }
  });

  it("bounds pathological compact targets without losing their tail and restores them on expansion", () => {
    const path = `root/${"é".repeat(10000)}/final.txt`;
    const renderer = createToolDisplayRenderers("read", nativeAdapter("read"));

    for (const expanded of [false, true]) {
      const rows = renderer
        .renderCall({ path, offset: 15, limit: 2 }, theme, context({ expanded }))
        .render(48);
      const visible = stripTerminalSequences(rows.join("\n")).replace(/\s+/g, "");
      expect(visible).toContain("root/");
      expect(visible).toContain("/final.txt:15-16");

      if (expanded) expect(visible).toContain(`${path}:15-16`);
      else {
        expect(visible).toContain("…");
        expect(visible.length).toBeLessThan(16_500);
      }
    }
  });
});
