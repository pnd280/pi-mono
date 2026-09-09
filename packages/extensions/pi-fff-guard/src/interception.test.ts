import { rm, symlink } from "node:fs/promises";
import path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
  ToolInfo
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import extension, { fffAdapter } from "./index.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory.root, { recursive: true, force: true });
});

function harness() {
  let handler:
    | ((event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallEventResult | undefined>)
    | undefined;
  let tools: ToolInfo[] = [];
  const notify = vi.fn();
  const api = {
    on: (eventName: string, callback: typeof handler) => {
      if (eventName === "tool_call") handler = callback;
    },
    getAllTools: () => tools
  } as unknown as ExtensionAPI;
  extension(api);
  expect(handler, "extension must register a tool_call handler").toBeTypeOf("function");
  return {
    notify,
    register(name: string, source = "npm:@ff-labs/pi-fff@0.10.6") {
      tools = [
        {
          name,
          description: "fixture tool",
          parameters: {},
          sourceInfo: {
            path: "/extensions/fixture.ts",
            source,
            scope: "temporary",
            origin: "top-level"
          }
        }
      ];
    },
    async call(name: string, input: Record<string, unknown>, signal?: AbortSignal) {
      const original = structuredClone(input);
      const result = await handler!(
        { type: "tool_call", toolName: name, toolCallId: name, input },
        {
          cwd: directory.root,
          signal,
          hasUI: false,
          ui: { notify }
        } as unknown as ExtensionContext
      );
      expect(input).toEqual(original);
      return result;
    }
  };
}

describe("public interception adapter", () => {
  it("blocks all six FFF variants registered after initialization", async () => {
    const host = harness();
    for (const name of ["fffind", "ffgrep", "fff-multi-grep", "find", "grep", "multi_grep"]) {
      host.register(name);
      const input = name.includes("multi")
        ? { patterns: ["fixture_marker"], constraints: "node_modules/" }
        : { pattern: "package", path: "node_modules/" };
      expect(await host.call(name, input)).toStrictEqual({
        block: true,
        reason: `${name} does not work with Git-ignored paths. Retry with rg or another available tool.`
      });
    }
  });

  it("validates missing files and broken links before ignore rules, without caching existence", async () => {
    const host = harness();
    host.register("ffgrep");
    const missingPath = "node_modules/a, b/missing.ts";
    expect(await host.call("ffgrep", { pattern: "marker", path: missingPath })).toStrictEqual({
      block: true,
      reason: "No such file or directory"
    });
    await directory.write(missingPath);
    expect(await host.call("ffgrep", { pattern: "marker", path: missingPath })).toStrictEqual({
      block: true,
      reason:
        "ffgrep does not work with Git-ignored paths. Retry with rg or another available tool."
    });
    await symlink("missing", path.join(directory.root, "src/broken"));
    expect(await host.call("ffgrep", { pattern: "marker", path: "src/broken" })).toStrictEqual({
      block: true,
      reason: "No such file or directory"
    });
  });

  it("checks ownership on every invocation, including reloads, without intercepting builtins", async () => {
    const host = harness();
    host.register("grep", "builtin");
    expect(
      await host.call("grep", { pattern: "fixture_marker", path: "node_modules/missing/" })
    ).toBeUndefined();
    host.register("grep");
    expect(
      (await host.call("grep", { pattern: "fixture_marker", path: "node_modules/" }))?.block
    ).toBe(true);
    host.register("grep", "sdk");
    expect(
      await host.call("grep", { pattern: "fixture_marker", path: "node_modules/" })
    ).toBeUndefined();
    const sourceInfo = {
      source: "cli",
      path: "/store/@ff-labs/pi-fff/src/index.ts",
      scope: "temporary",
      origin: "top-level"
    } as const;
    expect(fffAdapter({ name: "ffgrep", sourceInfo })).toBe("grep");
    expect(fffAdapter({ name: "fff-future-tool", sourceInfo })).toBeUndefined();
  });

  it("keeps concurrent handler calls independent and allows ordinary searches", async () => {
    const host = harness();
    host.register("ffgrep");
    const results = await Promise.all([
      host.call("ffgrep", { path: ".tmp/**", pattern: "marker" }),
      host.call("ffgrep", { path: "src/", pattern: "node_modules/" }),
      host.call("ffgrep", { path: ".", pattern: "marker", exclude: "node_modules/" }),
      host.call("ffgrep", { pattern: "node_modules/", cursor: "fff_c1" })
    ]);
    expect(results).toStrictEqual([
      {
        block: true,
        reason:
          "ffgrep does not work with Git-ignored paths. Retry with rg or another available tool."
      },
      undefined,
      undefined,
      undefined
    ]);
  });

  it("allows detection failures with a diagnostic and blocks cancelled calls", async () => {
    const host = harness();
    host.register("ffgrep");
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    await symlink("cycle", path.join(directory.root, "cycle"));
    expect(await host.call("ffgrep", { path: "cycle", pattern: "marker" })).toBeUndefined();
    expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining("detection unavailable"));
    const controller = new AbortController();
    controller.abort();
    const result = await host.call(
      "ffgrep",
      { path: "node_modules/", pattern: "marker" },
      controller.signal
    );
    expect(result).toStrictEqual({
      block: true,
      reason: "Ignored-path detection cancelled; no replacement search was started."
    });
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(host.notify).not.toHaveBeenCalled();
  });
});
