import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { getCapabilities, setCapabilityOverrides } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers as createPublicRenderers } from "pi-tool-display/renderers";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { nativeAdapter, type ToolDisplayAdapter } from "../adapters/index.ts";
import { plainTheme as theme } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { createToolDisplayRenderers } from "./cards.ts";
import type { ToolDisplayRenderers } from "./types.ts";

type Context = Parameters<ToolDisplayRenderers["renderCall"]>[2];

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
    durationMs: undefined,
    outputPad: 1,
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

  it.each(["patch", "live preview", "saved output"])(
    "keeps an image result unchanged when %s replaces retained text",
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
              renderer.renderResult(supplied, current, theme, current).render(100);
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

  it("expands and reflows retained output without altering model-visible data", () => {
    const source = Array.from({ length: 30 }, (_, index) => `row ${index}`).join("\n");
    const value = result(source);
    body("bash", value).render(80);
    const expanded = body("bash", value, context({ expanded: true }));
    for (const width of [10, 80]) expanded.render(width);

    expect(value).toEqual(result(source));
  });
});
