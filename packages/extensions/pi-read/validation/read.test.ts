import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type JsonObject,
  type ToolResultMessage
} from "@earendil-works/pi-ai";
import {
  createReadToolDefinition,
  initTheme,
  type ReadToolOptions,
  type Theme
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { describe, expect, it } from "vite-plus/test";

import { interpretReadResult, type ReadResult } from "../src/result.ts";
import { createSelectiveReadTool } from "../src/tool.ts";

const sample = "before\nalpha\nbeta\nafter\n";

type Call = { id: string; args: JsonObject };

type Execute = ReturnType<typeof createReadToolDefinition>["execute"];

/**
 * Registers pi-read around a spied native read, writes the files into the session directory, and lets a faux model send the calls in one turn.
 * Each spied native execution sends one progress update, so update forwarding is observable.
 */
async function readCalls(
  files: Record<string, string | Buffer>,
  calls: Call[],
  {
    during,
    ...readOptions
  }: ReadToolOptions & {
    during?: (abort: () => Promise<void>) => Promise<void>;
  } = {}
) {
  const executions: { call: Parameters<Execute>; value: ReturnType<Execute> }[] = [];
  const cwds = new Map<string, string>();
  const fixture = await hostFixture([
    (pi) => {
      const base = createReadToolDefinition(process.cwd(), readOptions);
      const original = base.execute.bind(base);

      base.execute = (...call) => {
        const [id, , , onUpdate, ctx] = call;
        cwds.set(id, ctx.cwd);
        onUpdate?.({ content: [{ type: "text", text: "progress" }], details: undefined });
        const value = original(...call);
        executions.push({ call, value });

        return value;
      };

      pi.registerTool(createSelectiveReadTool(base));
    }
  ]);
  const { session } = fixture;
  const updates: string[] = [];

  try {
    await fixture.bind();
    for (const [name, content] of Object.entries(files))
      await writeFile(join(fixture.directory, name), content);
    const faux = fauxProvider({ provider: "pi-read", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage(calls.map(({ id, args }) => fauxToolCall("read", args, { id }))),
      fauxAssistantMessage("done")
    ]);
    session.subscribe((event) => {
      if (event.type === "tool_execution_update") updates.push(event.toolCallId);
    });
    const prompt = session.prompt("Read the files");
    await during?.(() => session.abort());
    await prompt;
  } finally {
    await fixture.dispose();
  }

  const results = new Map(
    session.messages
      .filter((message): message is ToolResultMessage => message.role === "toolResult")
      .map((message) => [message.toolCallId, message])
  );

  return {
    directory: fixture.directory,
    updates,
    cwds,
    result(id: string): ReadResult & { isError: boolean } {
      const message = results.get(id);
      if (!message) throw new Error(`Expected a result for ${id}`);

      // Tool results keep the details that pi-read returned.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return { ...message, details: message.details as ReadResult["details"] };
    },
    executions(id: string) {
      return executions.filter(({ call }) => call[0] === id);
    },
    async native(id: string): Promise<ReadResult> {
      const [execution, ...rest] = this.executions(id);
      if (!execution || rest.length > 0) throw new Error(`Expected one native read for ${id}`);

      return await execution.value;
    }
  };
}

function lastText(result: ReadResult): string {
  const block = result.content.at(-1);
  if (block?.type !== "text") throw new Error("Expected a text result");

  return block.text;
}

function previewLines(result: ReadResult): string[] {
  return lastText(result).split("\n").slice(1);
}

it("executes the native read once with the caller's context, and appends a preview only for valid selections", async () => {
  const window = { path: "sample.txt", offset: 2, limit: 2 };
  const run = await readCalls({ "sample.txt": sample }, [
    { id: "identity", args: window },
    {
      id: "preview",
      args: {
        path: "sample.txt",
        selection: { startLine: 2, startColumn: 2, endLine: 3, endColumn: 3 }
      }
    },
    {
      id: "unsafe",
      args: {
        path: "sample.txt",
        selection: { startLine: 1, endColumn: Number.MAX_SAFE_INTEGER + 1 }
      }
    },
    { id: "reversed", args: { path: "sample.txt", selection: { startLine: 5, endLine: 2 } } },
    { id: "missing", args: { path: "missing.txt", selection: { startLine: 1 } } }
  ]);

  const [identity] = run.executions("identity");
  expect(identity?.call.slice(0, 4)).toEqual([
    "identity",
    window,
    expect.any(AbortSignal),
    expect.any(Function)
  ]);
  expect(run.cwds.get("identity")).toBe(run.directory);
  expect(run.updates).toContain("identity");
  const native = await run.native("identity");
  expect(run.result("identity")).toMatchObject({ content: native.content, isError: false });
  expect(run.result("identity").details).toEqual(native.details);

  const previewNative = await run.native("preview");
  const preview = run.result("preview");
  expect(preview.content[0]).toEqual(previewNative.content[0]);
  expect(previewLines(preview)).toEqual(["lpha", "be"]);
  expect(interpretReadResult(preview).sourceContent).toEqual(previewNative.content);
  expect(preview.details?.selectiveRead).toMatchObject({
    sourceBlocks: previewNative.content.length
  });

  for (const id of ["unsafe", "reversed"]) {
    expect(run.result(id).isError, id).toBe(true);
    expect(lastText(run.result(id)), id).toContain("Invalid read selection");
    expect(run.executions(id), id).toEqual([]);
  }

  const [missing] = run.executions("missing");
  const failure = await Promise.resolve(missing?.value).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : undefined)
  );
  expect(failure).toBeTypeOf("string");
  expect(run.result("missing")).toMatchObject({
    isError: true,
    content: [{ type: "text", text: failure }]
  });
});

it("forwards the caller's cancellation to the native read", async () => {
  let started!: () => void;
  const reading = new Promise<void>((resolve) => (started = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const run = await readCalls(
    { "sample.txt": sample },
    [{ id: "cancel", args: { path: "sample.txt", selection: { startLine: 1 } } }],
    {
      operations: {
        access: (path) => access(path),
        async readFile(path) {
          started();
          await released;

          return readFile(path);
        }
      },
      async during(abort) {
        await reading;
        const aborting = abort();
        release();
        await aborting;
      }
    }
  );

  const [cancelled] = run.executions("cancel");
  const signal = cancelled?.call[2];
  expect(signal?.aborted).toBe(true);
  await expect(Promise.resolve(cancelled?.value)).rejects.toThrow();
});

describe("native source windows", () => {
  const windows = [
    { window: { limit: -1 }, lines: ["before", "alpha", "beta", "after"] },
    { window: { offset: 2, limit: -2 }, lines: ["alpha", "beta", "after"] },
    { window: { limit: -0.1 }, lines: [] },
    { window: { offset: 2.8, limit: 1.4 }, lines: ["alpha", "beta"] }
  ];
  const big = Array.from({ length: 2002 }, (_, index) => `line ${index + 1}`).join("\n");
  const special = "before\r\n\t😀\u001b[31m\r\n\nend";

  it("previews only the source that the native read returned", async () => {
    const run = await readCalls(
      {
        "sample.txt": sample,
        "big.txt": big,
        "wide.txt": "x".repeat(60 * 1024),
        "special.txt": special
      },
      [
        ...windows.map(({ window }, index) => ({
          id: `window-${index}`,
          args: { path: "sample.txt", ...window, selection: { startLine: 1, endLine: 5 } }
        })),
        {
          id: "partial",
          args: { path: "sample.txt", offset: 2, limit: 2, selection: { startLine: 1, endLine: 3 } }
        },
        { id: "outside", args: { path: "sample.txt", limit: 1, selection: { startLine: 3 } } },
        {
          id: "returned",
          args: { path: "big.txt", limit: 2001, selection: { startLine: 2000, endLine: 2001 } }
        },
        { id: "wide", args: { path: "wide.txt", selection: { startLine: 1 } } },
        { id: "special", args: { path: "special.txt", selection: { startLine: 2, endLine: 3 } } }
      ]
    );

    for (const [index, { window, lines }] of windows.entries()) {
      const id = `window-${index}`;
      const result = run.result(id);
      const interpreted = interpretReadResult(result, window);
      expect(interpreted.sourceContent, id).toEqual((await run.native(id)).content);
      expect(interpreted.document?.lines, id).toEqual(lines);
      expect(interpreted.document?.notice, id).toContain("more lines in file");
      expect(lastText(result), id).not.toContain("more lines in file");
      if (lines.length > 0) expect(previewLines(result), id).toEqual(lines);
    }

    const partial = run.result("partial");
    expect(interpretReadResult(partial).document?.notice).toContain("more lines in file");
    expect(previewLines(partial)).toEqual(["alpha", "beta"]);

    const outside = run.result("outside");
    expect(interpretReadResult(outside).document?.notice).toContain("more lines in file");
    expect(lastText(outside)).not.toContain("more lines in file");

    const returned = run.result("returned");
    const returnedNative = await run.native("returned");
    expect(returnedNative.details?.truncation?.outputLines).toBe(2000);
    expect(interpretReadResult(returned).sourceContent).toEqual(returnedNative.content);
    expect(previewLines(returned)).toEqual(["line 2000"]);
    expect(lastText(returned)).not.toContain("Showing lines");

    const wideNative = await run.native("wide");
    expect(wideNative.details?.truncation?.firstLineExceedsLimit).toBe(true);
    expect(lastText(run.result("wide"))).not.toContain(lastText(wideNative));

    expect(previewLines(run.result("special")).join("\n")).toBe("\t😀\u001b[31m\r\n");
  });
});

it("highlights the line that the native read executed for coerced string windows", async () => {
  const args = { path: "sample.txt", offset: "2", limit: "2", selection: { startLine: 2 } };
  const run = await readCalls({ "sample.txt": sample }, [{ id: "coerced", args }]);
  const result = run.result("coerced");
  expect(previewLines(result)).toEqual(["alpha"]);

  initTheme("dark", false);
  const themeMethods: Pick<Theme, "fg" | "bg" | "bold" | "getBgAnsi"> = {
    fg: (_color, text) => text,
    bg: (_color, text) => `\u001b[43m${text}\u001b[49m`,
    bold: (text) => text,
    getBgAnsi: () => "\u001b[49m"
  };
  const tool = createSelectiveReadTool(createReadToolDefinition(run.directory));
  const rendered = tool
    .renderResult(
      result,
      { expanded: true, isPartial: false },
      // The renderer uses only these theme methods; syntax colouring is owned by the shared helper.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      themeMethods as Theme,
      {
        // Pi passes the arguments that the model sent, before its coercion.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        args: args as never,
        toolCallId: "coerced",
        invalidate() {},
        lastComponent: undefined,
        state: {},
        cwd: run.directory,
        executionStarted: true,
        argsComplete: true,
        isPartial: false,
        expanded: true,
        showImages: true,
        isError: false,
        durationMs: undefined,
        outputPad: 1,
        keyText: (keybinding) => keybinding,
        keyHint: (keybinding, description) => `${keybinding} ${description}`
      }
    )
    .render(80);
  const marked = rendered.filter((line) => line.includes("\u001b[43m"));
  expect(marked.map((line) => stripTerminalSequences(line).trim())).toEqual(["alpha"]);
});

it("leaves native images and text-only image failure notes untouched", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
    "base64"
  );
  // A BMP header that Pi recognises, with no pixel data to decode.
  const bmp = Buffer.alloc(54);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  const run = await readCalls(
    { "image.png": png, "broken.bmp": bmp },
    [
      { id: "png", args: { path: "image.png", selection: { startLine: 1 } } },
      { id: "bmp", args: { path: "broken.bmp", selection: { startLine: 1 } } }
    ],
    { autoResizeImages: false }
  );

  for (const [id, hasImage] of [
    ["png", true],
    ["bmp", false]
  ] as const) {
    const native = await run.native(id);
    expect(
      native.content.some((block) => block.type === "image"),
      id
    ).toBe(hasImage);
    expect(run.result(id), id).toMatchObject({ content: native.content, isError: false });
    expect(run.result(id).details, id).toEqual(native.details);
  }
});
