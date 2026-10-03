import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { createReadTool, initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences
} from "@earendil-works/pi-tui";
import { createToolDisplayRenderers as createPublicRenderers } from "pi-tool-display/renderers";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import {
  nativeAdapter,
  piFffAdapter,
  selectiveReadDisplayAdapter,
  type ToolDisplayAdapter
} from "../adapters/index.ts";
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

describe("tool display renderers", () => {
  it.each([false, true])(
    "skips CLI-only callbacks while retained standalone slots refresh their card meaning (supports throws=%s)",
    (supportsThrows) => {
      const cliOnly = vi.fn(() => {
        throw new Error("No transcript consumer");
      });
      const supports = vi.fn(() => {
        if (supportsThrows) throw new Error("No automatic selection");

        return false;
      });
      const adapter: ToolDisplayAdapter = {
        id: "owner:standalone-meaning",
        family: "invocation",
        supports,
        exploration: cliOnly,
        summaryItems: cliOnly,
        get groupTitle() {
          return cliOnly();
        },
        get summaryCategories() {
          return cliOnly();
        },
        mcp: (_args, supplied) => {
          const tool = typeof supplied?.details === "string" ? supplied.details : "pending";

          return {
            server: "docs",
            tool,
            outcome: tool === "cancelled" ? "cancelled" : "success",
            content: [{ type: "text", text: `typed ${tool}` }]
          };
        },
        outcome: (supplied) => (supplied.details === "failed" ? "failure" : "success")
      };
      const renderer = createPublicRenderers("lookup", adapter);
      const current = context({ args: { query: "needle" } });
      const header = renderer.renderCall(current.args, theme, { ...current, isPartial: true });
      expect(header.render(100).join("\n")).toContain("Calling docs.pending");
      let output = renderer.renderResult(
        { ...result("flattened"), details: "search" },
        current,
        theme,
        current
      );

      for (const [details, isError, isPartial, action] of [
        ["search", false, false, "Called"],
        ["failed", false, false, "Call failed"],
        ["cancelled", true, false, "Call cancelled"],
        ["cancelled", false, true, "Calling"],
        ["search", true, false, "Call failed"],
        ["list", false, false, "Called"]
      ] as const) {
        const supplied = { ...result("flattened"), details };
        const before = structuredClone({ supplied, args: current.args });
        output = renderer.renderResult(supplied, { expanded: false, isPartial }, theme, {
          ...current,
          isError,
          lastComponent: output
        });

        for (let redraw = 0; redraw < 20; redraw++) {
          expect(header.render(100).join("\n")).toContain(`${action} docs.${details}`);
          expect(output.render(100).join("\n")).toContain(`typed ${details}`);
        }

        header.invalidate();
        expect(header.render(100).join("\n")).toContain(`${action} docs.${details}`);
        expect(output.render(100).join("\n")).toContain(`typed ${details}`);
        expect({ supplied, args: current.args }).toEqual(before);
      }

      expect(cliOnly).not.toHaveBeenCalled();
      expect(supports).not.toHaveBeenCalled();
    }
  );

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
      ["src/file\u00a0name.ts", "src/file name.ts"],
      ["src/file\u2007name.ts", "src/file name.ts"],
      ["src/file\u202fname.ts", "src/file name.ts"],
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
      const args = Object.freeze({
        path: resolve(cwd, "src/file\u00a0name.ts"),
        pattern: "needle"
      });

      for (const expanded of [false, true]) {
        const rows = toolRenderer.renderCall(args, theme, context({ cwd, expanded })).render(240);
        expect(rows[0]?.endsWith(" src/file name.ts"), `${name}: expanded=${expanded}`).toBe(true);
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

  it("groups native Unicode-space targets without normalizing custom paths or FFF filters", () => {
    const cwd = "/workspace/project";
    const coordinator = new TranscriptCoordinator("native-space-paths", { cwd });
    let index = 0;

    const add = (name: string, args: unknown, adapter: ToolDisplayAdapter) => {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
        name,
        args,
        adapter,
        "historical"
      );
      coordinator.result(call, result("retained"), "success");

      return call;
    };

    const nativeArgs = Object.freeze({ path: "src\u00a0dir/first\u2007file.ts" });
    const selectedArgs = Object.freeze({
      path: "src\u202fdir/second\u00a0file.ts",
      selection: Object.freeze({ startLine: 2 })
    });

    try {
      const calls = [
        add("read", nativeArgs, nativeAdapter("read")!),
        add("read", selectedArgs, selectiveReadDisplayAdapter),
        add("ls", { path: "src dir" }, nativeAdapter("ls")!),
        add(
          "grep",
          { path: "src\u2007dir", pattern: "literal\u00a0pattern" },
          nativeAdapter("grep")!
        )
      ];
      const first = calls[0]!;
      expect(coordinator.group(first)?.members).toEqual(calls);
      const heading = (call: (typeof calls)[number]) =>
        createToolDisplayRenderers(call.name, call.adapter, { binding: { call, coordinator } })
          .renderCall(call.args, theme, context({ cwd, expanded: call.expanded }))
          .render(160)
          .join("\n");
      expect(heading(first)).toContain("Explored src dir");
      expect(heading(first)).toContain("Read first file.ts");
      expect(heading(calls[1]!)).toContain("Read second file.ts · selection 2");
      expect(heading(calls[3]!)).toContain("literal\u00a0pattern");
      coordinator.expand(first, true);
      expect(heading(first)).toContain("Read src dir/first file.ts");
      expect(heading(calls[1]!)).toContain("Read src dir/second file.ts · selection 2");
      coordinator.expand(first, false);

      const literalPath = "src\u00a0dir/custom\u00a0file.ts";
      const custom = add(
        "custom",
        {},
        {
          id: "custom:literal-path",
          family: "read",
          invocation: () => [{ kind: "path", text: literalPath }],
          exploration: () => [
            {
              parts: [{ kind: "path", text: literalPath }],
              scope: { kind: "file", value: literalPath }
            }
          ]
        }
      );
      expect(coordinator.group(custom)).toBeUndefined();
      expect(heading(custom)).toContain(literalPath);

      const fff = piFffAdapter(fffToolInfo("ffgrep"))!;
      const filtered = add("ffgrep", { pattern: "needle", path: "src\u00a0dir/**" }, fff);
      const otherFilter = add("ffgrep", { pattern: "needle", path: "src dir/**" }, fff);
      expect(coordinator.group(filtered)).toBeUndefined();
      expect(coordinator.group(otherFilter)).toBeUndefined();
      expect(heading(filtered)).toContain("src\u00a0dir/**");
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

  it("retains native read recovery guidance without promoting source lookalikes", async () => {
    const cases = [
      {
        source: "one\ntwo\nthree",
        args: { path: "a.txt", limit: 1 },
        notice: "[2 more lines in file. Use offset=2 to continue.]"
      },
      {
        source: "one\ntwo\nthree",
        args: { path: "a.txt", offset: 1.5, limit: 1 },
        notice: "[1.5 more lines in file. Use offset=2.5 to continue.]"
      },
      {
        source: "one\ntwo\nthree",
        args: { path: "a.txt", limit: -2 },
        notice: "[5 more lines in file. Use offset=-1 to continue.]"
      },
      {
        source: "one\ntwo\nthree",
        args: { path: "a.txt", limit: -1e21 },
        notice: "[1e+21 more lines in file. Use offset=-1e+21 to continue.]"
      },
      {
        source: "line\n".repeat(2001) + "last",
        args: { path: "a.txt", offset: 1.5 },
        notice: "[Showing lines 1.5-2000.5 of 2002. Use offset=2001.5 to continue.]"
      },
      {
        source: "x".repeat(51 * 1024),
        args: { path: "a.txt" },
        notice:
          "[Line 1 is 51.0KB, exceeds 50.0KB limit. Use bash: sed -n '1p' a.txt | head -c 51200]"
      },
      {
        source: "Example:\n[2 more lines in file. Use offset=2 to continue.]\nEnd of example.",
        args: { path: "a.txt" },
        notice: undefined
      }
    ];

    for (const fixture of cases) {
      const native = createReadTool("/tmp", {
        operations: {
          access: async () => {},
          readFile: async () => Buffer.from(fixture.source)
        }
      });
      const supplied = await native.execute("read", fixture.args);
      const before = structuredClone(supplied);
      const coordinator = new TranscriptCoordinator("read-recovery", { cwd: "/tmp" });

      try {
        const adapter = nativeAdapter("read")!;
        const first = coordinator.add(
          { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" },
          "read",
          fixture.args,
          adapter,
          "historical"
        );
        const sibling = coordinator.add(
          { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
          "read",
          { path: "b.txt" },
          adapter,
          "historical"
        );
        coordinator.result(first, supplied, "success");
        coordinator.result(sibling, result("sibling source"), "success");

        for (const grouped of [false, true]) {
          const renderer = createToolDisplayRenderers(
            "read",
            adapter,
            grouped ? { binding: { call: first, coordinator } } : {}
          );

          for (const expanded of [false, true]) {
            coordinator.expand(first, expanded);
            const current = context({ args: fixture.args, expanded });
            const call = renderer.renderCall(fixture.args, theme, current);
            const body = renderer.renderResult(supplied, current, theme, current);
            const text = [...call.render(160), ...body.render(160)].join("\n");
            if (fixture.notice) expect(text.split(fixture.notice)).toHaveLength(2);
            else if (expanded) expect(text).toContain("End of example.");
            else expect(text).not.toContain("Use offset=");
          }
        }

        expect(supplied).toEqual(before);
      } finally {
        coordinator.dispose();
      }
    }
  });

  it.each([false, true])(
    "shows FFF pagination in standalone and grouped cards (expanded=%s)",
    (expanded) => {
      const adapter = piFffAdapter(fffToolInfo("fffind"))!;
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
    "[Image omitted: could not be converted to a supported inline image format.]",
    "[Image omitted: could not be resized below the inline image size limit.]"
  ])("retains native image warning %s in compact and expanded reads", (warning) => {
    const supplied: AgentToolResult<unknown> = {
      content: [{ type: "text", text: `Read image file [image/png]\n${warning}` }],
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

      const sibling = coordinator.add(
        { messageTimestamp: 1, contentIndex: 1, toolCallId: "sibling" },
        "read",
        { path: "other.txt" },
        adapter,
        "historical"
      );
      coordinator.result(sibling, result("sibling source"), "success");
      expect(coordinator.group(call)?.members).toEqual([call, sibling]);

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
          expect(rows).not.toContain("failed");
        }
      }

      expect(supplied).toEqual(original);
    } finally {
      coordinator.dispose();
    }
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
});
