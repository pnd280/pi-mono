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
import { createToolDisplayRenderers as createPublicRenderers } from "pi-tool-display/renderers";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { fffToolInfo } from "./adapters/fff/test-fixture.ts";
import {
  genericAdapter,
  nativeAdapter,
  officialFffAdapter,
  type McpFacts
} from "./adapters/index.ts";
import type { OutputText } from "./output-text.ts";
import { createToolDisplayRenderers, type ToolDisplayRenderers } from "./renderers.ts";
import { renderingTui } from "./test-fixture.ts";
import { TranscriptCoordinator } from "./transcript-coordinator.ts";

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

  it("uses adapter contract validation for fallback and grouping without provider-specific IDs", () => {
    const adapter = {
      id: "documentation:search",
      family: "search" as const,
      supports: (_args: unknown, result: AgentToolResult<unknown>) =>
        result.details === "supported",
      exploration: () => [
        { label: "Search" as const, parts: [{ kind: "value" as const, text: "documentation" }] }
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

  it.each([
    ["edit", "Editing", "Edited", { path: "example.ts", edits: [] }],
    ["write", "Writing", "Wrote", { path: "example.ts", content: "replacement" }],
    ["read", "Reading", "Read", { path: "example.ts" }],
    ["grep", "Searching", "Searched", { pattern: "needle", path: "." }],
    ["find", "Searching", "Searched", { pattern: "*.ts", path: "." }],
    ["ls", "Listing", "Listed", { path: "." }],
    ["bash", "Running", "Ran", { command: "printf example" }],
    ["powershell", "Running", "Ran", { command: "Write-Output example" }],
    ["fffind", "Searching", "Searched", { pattern: "example" }],
    ["ffgrep", "Searching", "Searched", { pattern: "example" }],
    ["fff-multi-grep", "Searching", "Searched", { patterns: ["example"] }],
    ["custom.lookup", "Calling", "Called", { query: "example" }]
  ] as const)(
    "keeps %s action headings through preparation, queueing, execution, completion, and replay",
    (name, active, complete, args) => {
      const adapter = name.startsWith("ff")
        ? officialFffAdapter({
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
        expect(heading).toMatch(new RegExp(`^[•◦] ${complete}(?: |$)`));
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

          assertHeading(active, "Exploring");
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
            assertHeading(complete, "Explored");
          }
        } finally {
          coordinator.dispose();
        }
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
        ["failure", "Wrote"],
        ["cancelled", "Cancelled"]
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
      ).toBe("• Outcome unavailable missing.ts");
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

  it("keeps full cwd-relative or outside-absolute paths in grouped and expanded reads", () => {
    const cwd = resolve("/workspace/project");
    const coordinator = new TranscriptCoordinator("file-paths");

    try {
      const paths = [resolve(cwd, "src/file.ts"), "tests/file.ts", "../shared/file.ts"];
      const expected = [
        "src/file.ts",
        "tests/file.ts",
        resolve(cwd, "../shared/file.ts").split(sep).join("/")
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
        coordinator.expand(calls[0]!, expanded);
        calls.forEach((call, index) => {
          const rows = createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context({ cwd, expanded }))
            .render(240);
          expect(rows).toContain(
            `${expanded ? "•" : index === calls.length - 1 ? "  └" : "  ├"} Read ${expected[index]}`
          );
        });
      }
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
    const preview = {
      text: `${marker}\n${marker}\nretained output`,
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
          call.savedOutput = { path: "saved-output", text: "substituted output" };
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
  it("colors only FFF search patterns in grouped, expanded, and standalone summaries", () => {
    const themed = semanticTheme();

    for (const name of ["fffind", "ffgrep", "fff-multi-grep", "find", "grep", "multi_grep"]) {
      const multi = name === "fff-multi-grep" || name === "multi_grep";
      const adapter = officialFffAdapter({
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
            expect(stripTerminalSequences(rows)).toContain(`${pattern} in ${scope}`);
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
          'Search "" in packages/utils/src/fff-tools.ts',
          'Searched "" in packages/utils/src/fff-tools.ts'
        ],
        ["ffgrep", { pattern: "" }, 'Search ""', 'Searched "" in .'],
        [
          "fffind",
          { pattern: "", path: "packages/" },
          "List files in packages/",
          "Listed files in packages/"
        ],
        ["fffind", { pattern: "" }, "List files in .", "Listed files in ."]
      ] as const
    ).flatMap(([name, args, compact, expanded]) =>
      [false, true].map((isExpanded) => ({ name, args, compact, expanded, isExpanded }))
    )
  )(
    "renders explicit empty $name patterns (expanded=$isExpanded, args=$args)",
    ({ name, args, compact, expanded, isExpanded }) => {
      Object.freeze(args);
      const adapter = officialFffAdapter(fffToolInfo(name))!;
      const coordinator = new TranscriptCoordinator("empty-search-patterns");

      try {
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: name },
          name,
          args,
          adapter,
          "historical"
        );
        const supplied = result("retained backend output");
        coordinator.result(call, supplied, "success");
        coordinator.expand(call, isExpanded);
        const renderer = createToolDisplayRenderers(name, adapter, {
          binding: { call, coordinator }
        });
        const current = context({ args, expanded: isExpanded });
        expect(renderer.renderCall(args, theme, current).render(120)).toEqual(
          isExpanded ? [`• ${expanded}`] : ["• Explored", `  └ ${compact}`]
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
      const adapter = officialFffAdapter(fffToolInfo(name))!;

      for (const expanded of [false, true]) {
        const args = { path: "packages/" };
        expect(adapter.exploration?.(args)).toBeUndefined();
        expect(
          createToolDisplayRenderers(name, adapter)
            .renderCall(args, theme, context({ expanded }))
            .render(100)
        ).toEqual(["• Searched (pattern missing) in packages/"]);
      }
    }
  );

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
      const heading = [first, ...failures]
        .flatMap((call) =>
          createToolDisplayRenderers(call.name, call.adapter, {
            binding: { call, coordinator }
          })
            .renderCall(call.args, theme, context())
            .render(100)
        )
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

  it.each([false, true])(
    "shows FFF pagination in standalone and grouped cards (expanded=%s)",
    (expanded) => {
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
      expect(standalone).toContain("renderers.ts");
      expect(standalone).toContain(notice);
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
        const read = coordinator.add(
          { messageTimestamp: 1, contentIndex: 1, toolCallId: "read" },
          "read",
          { path: "renderers.ts" },
          nativeAdapter("read")!,
          "historical"
        );
        coordinator.result(read, result("retained file text"), "success");
        coordinator.result(search, supplied, "success");
        coordinator.expand(search, expanded);
        const rows = [search, read].flatMap((call) => {
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
          expect(rows.join("\n")).toContain("retained file text");
        } else
          expect(rows).toEqual([
            "• Explored",
            "  ├ Search renderers in src/",
            `  │   ${notice}`,
            "  └ Read renderers.ts"
          ]);
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
      const search = officialFffAdapter({
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
        ["read", { path: "a.ts" }, nativeAdapter("read")!],
        ["fffind", { pattern: "renderers", path: "src/" }, search],
        ["read", { path: "a.ts" }, nativeAdapter("read")!]
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
        expect(rendered[0]).toEqual(["• Explored", "  ├ Read a.ts"]);
        expect(rendered[1]![0]).toBe("  ├ Search renderers in src/");
        expect(rendered[1]!.slice(1).every((row) => row.startsWith("  │   "))).toBe(true);
        expect(
          rendered[1]!
            .slice(1)
            .map((row) => row.slice(6))
            .join(" ")
        ).toContain("only weak scattered fuzzy matches");
        expect(rendered[2]).toEqual(["  └ Read a.ts"]);
        expect(rendered.flat().every((row) => visibleWidth(row) <= width)).toBe(true);
      }
    } finally {
      coordinator.dispose();
    }
  });

  it("retains multiline FFF query warnings in collapsed exploration", () => {
    const coordinator = new TranscriptCoordinator("multiline-query-warning");

    try {
      const adapter = officialFffAdapter(fffToolInfo("fffind"))!;
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: 0, toolCallId: "multiline" },
        "fffind",
        { pattern: "foo\nbar" },
        adapter,
        "historical"
      );
      const warning =
        '[Query "foo\nbar" produced only weak scattered fuzzy matches. Output capped at 1/10.]';
      const supplied = result(`src/example.ts\n\n${warning}`);
      const original = structuredClone(supplied);
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
      expect(compact).not.toContain("src/example.ts");
      coordinator.expand(call, true);
      const current = context({ args: call.args, expanded: true });
      const expanded = renderer
        .renderResult(supplied, current, theme, current)
        .render(100)
        .map(stripTerminalSequences)
        .join("\n");
      expect(expanded).toContain("src/example.ts");
      expect(expanded).toContain("weak scattered fuzzy matches");
      expect(supplied).toEqual(original);
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
    const value = result(Array.from({ length: 30 }, (_, index) => `row ${index}`).join("\n"));
    const original = structuredClone(value);
    expect(body("bash", value).render(80)).toHaveLength(5);
    const expanded = body("bash", value, context({ expanded: true }));
    expect(expanded.render(80)).toHaveLength(30);
    expect(expanded.render(10).every((row) => visibleWidth(row) <= 10)).toBe(true);
    expect(value).toEqual(original);
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
      call.change = {
        kind: "change",
        availability: "unavailable",
        reason: "Change exceeds the diff computation budget."
      };
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
    } finally {
      coordinator.dispose();
    }
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

  it("keeps the first hunk's edits visible when wrapped context would consume the compact budget", () => {
    const leading = Array.from({ length: 4 }, () => " " + "leading context ".repeat(40)).join("\n");
    const trailing = Array.from({ length: 4 }, () => " " + "trailing context ".repeat(40)).join(
      "\n"
    );
    const shared = "shared ".repeat(10);
    const patch = `@@ -23,9 +23,9 @@ first section\n${leading}\n-FIRST_OLD ${shared} END_OLD\n+FIRST_NEW ${shared} END_NEW\n${trailing}\n@@ -100 +100 @@ second section\n-SECOND_OLD\n+SECOND_NEW\n`;
    const value = { ...result("Successfully edited example.txt"), details: { patch } };

    for (const width of [40, 80, 157]) {
      const rows = body("edit", value).render(width);
      const compact = stripTerminalSequences(rows.join("\n"));
      expect(compact).toContain("FIRST_OLD");
      expect(compact).toContain("FIRST_NEW");
      expect(compact).toContain("END_OLD");
      expect(compact).toContain("END_NEW");
      expect(compact).toContain("Hunk 1/2");
      expect(compact).not.toContain("SECOND_OLD");
      expect(rows.length).toBeLessThanOrEqual(37); // Summary, 30 changed rows, context and labels.
      const expanded = stripTerminalSequences(
        body("edit", value, context({ expanded: true }))
          .render(width)
          .join("\n")
      );
      expect(expanded).toContain("Hunk 2/2");
      expect(expanded).toContain("SECOND_OLD");
      expect(expanded).toContain("SECOND_NEW");
    }
  });

  it("excerpts long changed lines around the actual edit instead of their shared prefix or suffix", () => {
    const prefix = "unchanged prefix ".repeat(100);
    const suffix = " unchanged suffix".repeat(100);
    const before = prefix + "OLD_TARGET" + suffix;
    const after = prefix + "NEW_TARGET" + suffix;
    const value = {
      ...result("Successfully edited example.txt"),
      details: { patch: `@@ -5 +5 @@\n-${before}\n+${after}\n` }
    };

    for (const width of [80, 157]) {
      const rows = body("edit", value).render(width);
      const compact = stripTerminalSequences(rows.join("\n"));
      expect(compact).toContain("OLD_TARGET");
      expect(compact).toContain("NEW_TARGET");
      expect(compact).not.toContain("Hunk 1/1");
      expect(rows.length).toBeLessThanOrEqual(37);
      const expanded = stripTerminalSequences(
        body("edit", value, context({ expanded: true }))
          .render(width)
          .join("\n")
      );
      expect(expanded).toContain("OLD_TARGET");
      expect(expanded).toContain("NEW_TARGET");
      expect(expanded.match(/unchanged/g)).toHaveLength(400);
    }
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
      const branches = rows.split("\n").filter((row) => /^  [├└] /.test(row));
      expect(branches).toHaveLength(3);
      expect(branches.map((row) => row.slice(0, 4))).toEqual(["  ├ ", "  ├ ", "  └ "]);
      expect(rows).toContain("before");
      expect(rows.indexOf("before")).toBeLessThan(rows.indexOf("Media"));
      expect(rows.indexOf("Media")).toBeLessThan(rows.indexOf("after"));
      expect(rows.includes("Transport error")).toBe(outcome === "transport-error");
      expect(rows.includes("Tool returned an error")).toBe(outcome === "returned-error");
      expect(rows).not.toContain("private");
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
        successMarker = theme.fg("success", "•");

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
