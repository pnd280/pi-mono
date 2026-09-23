import { rm, symlink } from "node:fs/promises";
import path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
  ToolInfo
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import extension from "./index.ts";
import { fixture } from "./test-fixture.ts";

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory.root, { recursive: true, force: true });
});

function harness({ hasUI = false }: { hasUI?: boolean } = {}) {
  let handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult> | undefined;
  let tools: ToolInfo[] = [];
  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();

  const on = (eventName: "tool_call", callback: NonNullable<typeof handler>) => {
    expect(eventName).toBe("tool_call");
    handler = callback;
  };

  const api = {
    on,
    getAllTools: () => tools
  } satisfies Pick<ExtensionAPI, "getAllTools"> & { on: typeof on };
  // This adapter registers only tool_call and discovers tools; other host APIs are unused.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  extension(api as unknown as ExtensionAPI);
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
      const context = {
        cwd: directory.root,
        signal,
        hasUI,
        ui: { notify }
      } satisfies Pick<ExtensionContext, "cwd" | "signal" | "hasUI"> & {
        ui: Pick<ExtensionContext["ui"], "notify">;
      };
      const result = await handler!(
        { type: "tool_call", toolName: name, toolCallId: name, input },
        // The guard only reads these context fields; no session or interactive UI is needed.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        context as unknown as ExtensionContext
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

  it("keeps recursive filename filters independent of ignored cwd matches", async () => {
    await directory.write(".gitignore", "/config.json\n/ignored/\n");
    await directory.write("config.json");
    await directory.write("src/config.json");
    await directory.write("ignored/config.json");
    const host = harness();
    const aliases = ["config.json", "./config.json", path.join(directory.root, "config.json")];

    for (const name of ["fffind", "ffgrep"]) {
      host.register(name);
      for (const filename of aliases)
        expect(
          await host.call(name, { pattern: "marker", path: filename }),
          filename
        ).toBeUndefined();
      const blocked = await host.call(name, { pattern: "marker", path: "./ignored/config.json" });
      expect(blocked?.block).toBe(true);
      expect(blocked?.reason).toContain("Git-ignored");
    }

    await rm(path.join(directory.root, "config.json"));

    for (const name of ["fffind", "ffgrep"]) {
      host.register(name);
      for (const filename of aliases)
        expect(
          await host.call(name, { pattern: "marker", path: filename }),
          filename
        ).toBeUndefined();
    }
  });

  it("retains intersecting scopes across exclusions and concrete files, independent of order", async () => {
    const host = harness();
    host.register("fff-multi-grep");
    for (const constraints of [
      "node_modules/** node_modules/**/*.ts !*.ts",
      "node_modules/**/*.ts node_modules/** !*.ts",
      "node_modules/**/*.{ts,js} node_modules/**/*.ts !*.ts",
      "node_modules/**/*.ts node_modules/**/*.{ts,js} !*.ts",
      "node_modules/**/*.ts node_modules/dependency/ !*.ts",
      "node_modules/**/*.ts node_modules/** node_modules/dependency/package.json",
      "node_modules/** node_modules/**/*.ts node_modules/dependency/package.json"
    ])
      expect(
        await host.call("fff-multi-grep", { patterns: ["marker"], constraints }),
        constraints
      ).toBeUndefined();
    const blocked = await host.call("fff-multi-grep", {
      patterns: ["marker"],
      constraints: "node_modules/**/*.{ts,js} node_modules/dependency/ !*.ts"
    });
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("Git-ignored");
  });

  it("allows fully excluded filename filters within ignored directories", async () => {
    const host = harness();
    host.register("fffind");
    for (const exclude of ["*.ts", "./*.ts", path.join(directory.root, "*.ts")])
      expect(
        await host.call("fffind", { path: "node_modules/", pattern: "*.ts", exclude }),
        exclude
      ).toBeUndefined();
    const blocked = await host.call("fffind", {
      path: "node_modules/",
      pattern: "*.ts",
      exclude: "*.js"
    });
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("Git-ignored");
    host.register("fff-multi-grep");
    expect(
      await host.call("fff-multi-grep", {
        patterns: ["marker"],
        constraints: "*.ts node_modules/ !*.ts"
      })
    ).toBeUndefined();
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

  it.each([
    ["fffind", { pattern: 42 }],
    ["ffgrep", { path: false }],
    ["fff-multi-grep", { constraints: [] }],
    ["ffgrep", { exclude: ["*.ts", 42] }]
  ] as const)(
    "allows malformed scope fields for %s with a diagnostic: %j",
    async (name, invalid) => {
      const host = harness();
      host.register(name);
      const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(
        await host.call(name, { path: "node_modules/", pattern: "*.ts", ...invalid })
      ).toBeUndefined();
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Invalid FFF"));
    }
  );

  it.each([false, true])("sanitizes filesystem diagnostics (UI: %s)", async (hasUI) => {
    const host = harness({ hasUI });
    host.register("ffgrep");
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const name = "\x1b]52;c;Zml4dHVyZQ==\x07cycle";
    await symlink(name, path.join(directory.root, "src", name));

    expect(await host.call("ffgrep", { path: `src/${name}`, pattern: "marker" })).toBeUndefined();
    const report = hasUI ? host.notify : stderr;
    expect(report).toHaveBeenCalledTimes(1);
    const message: unknown = report.mock.calls[0]?.[0];
    if (typeof message !== "string") throw new Error("Expected a diagnostic string.");
    expect(message).toContain("detection unavailable");
    expect(message).toContain("Allowing the FFF call.");
    expect(message.includes("\x1b")).toBe(false);
    expect(message.includes("\x07")).toBe(false);
    expect(hasUI ? stderr : host.notify).not.toHaveBeenCalled();
  });

  it("blocks caller cancellation without a detection-failure diagnostic", async () => {
    const host = harness();
    host.register("ffgrep");
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(diagnostic).not.toHaveBeenCalled();
    expect(host.notify).not.toHaveBeenCalled();
  });
});
