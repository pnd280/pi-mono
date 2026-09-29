import { fauxToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vite-plus/test";

import register from "../index.ts";
import { sourceResult, type ReadResult } from "./result.ts";
import { createSelectiveReadTool, type SelectiveReadParams } from "./tool.ts";

const readContext: Pick<ExtensionContext, "cwd"> = { cwd: "/session" };
// The native read adapter consumes cwd and model, not UI or session APIs.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const context = readContext as ExtensionContext;

function fixture(source = "before\nalpha\nbeta\nafter\n") {
  const readFile = vi.fn(async () => Buffer.from(source));
  const base = createReadToolDefinition("/fallback", {
    operations: { access: async () => {}, readFile }
  });
  const execute = vi.spyOn(base, "execute");
  const tool = createSelectiveReadTool(base);

  return {
    execute,
    tool,
    readFile,
    run: (args: Partial<SelectiveReadParams> = {}) =>
      tool.execute("call", { path: "sample.ts", ...args }, undefined, undefined, context)
  };
}

async function nativeResult(execute: ReturnType<typeof fixture>["execute"]): Promise<ReadResult> {
  const call = execute.mock.results[0];
  if (call?.type !== "return") throw new Error("Expected native read to return");

  return call.value;
}

function lastText(result: ReadResult): string {
  const block = result.content.at(-1);
  if (block?.type !== "text") throw new Error("Expected a text result");

  return block.text;
}

it("registers a read tool whose selections pass Pi's argument validator", () => {
  const args = { path: "sample.ts", selection: { startLine: 2, endColumn: 4 } };
  let registrations = 0;
  register({
    registerTool(tool) {
      registrations++;
      expect(tool.name).toBe("read");
      expect(validateToolArguments(tool, fauxToolCall("read", args, { id: "valid" }))).toEqual(
        args
      );

      for (const selection of [{}, { startLine: 1.5 }, { startLine: 2, extra: true }]) {
        expect(() => {
          validateToolArguments(
            tool,
            fauxToolCall("read", { path: "sample.ts", selection }, { id: "invalid" })
          );
        }).toThrow();
      }
    }
  });
  expect(registrations).toBe(1);
});

it("keeps runtime metadata and unsupported integer bounds out of the serialized tool schema", () => {
  const { tool } = fixture();
  const serialized = JSON.stringify(tool.parameters);
  for (const keyword of ["~standard", "minimum", "maximum"])
    expect(serialized).not.toContain(`"${keyword}"`);
  const description: unknown = expect.any(String);
  expect(JSON.parse(serialized)).toMatchObject({
    type: "object",
    required: ["path"],
    properties: {
      selection: {
        type: "object",
        required: ["startLine"],
        additionalProperties: false,
        properties: {
          startLine: { type: "integer", description },
          startColumn: { type: "integer", description },
          endLine: { type: "integer", description },
          endColumn: { type: "integer", description }
        }
      }
    }
  });
});

it("returns native results unchanged without a selection and forwards execution context", async () => {
  const { tool, execute } = fixture();
  const signal = new AbortController().signal;
  const onUpdate = vi.fn();
  const args = { path: "sample.ts", offset: 2, limit: 2 };
  const result = await tool.execute("identity", args, signal, onUpdate, context);
  expect(result).toBe(await nativeResult(execute));
  expect(execute).toHaveBeenCalledExactlyOnceWith("identity", args, signal, onUpdate, context);
});

it("adds a preview without changing native blocks or details and reads only once", async () => {
  const { run, execute, readFile } = fixture();
  const result = await run({
    selection: { startLine: 2, startColumn: 2, endLine: 3, endColumn: 3 }
  });
  const native = await nativeResult(execute);
  expect(result.content[0]).toBe(native.content[0]);
  expect(lastText(result).split("\n").slice(1)).toEqual(["lpha", "be"]);
  expect(sourceResult(result).content).toEqual(native.content);
  expect(result.details?.selectiveRead).toEqual({ sourceBlocks: native.content.length });
  expect(readFile).toHaveBeenCalledExactlyOnceWith("/session/sample.ts");
  expect(execute.mock.calls[0]![1]).toEqual({ path: "sample.ts" });
});

it("rejects invalid selections before reading, and preserves native errors and cancellation", async () => {
  const { run, execute, tool, readFile } = fixture();
  for (const selection of [
    { startLine: 0 },
    { startLine: 1, endColumn: Number.MAX_SAFE_INTEGER + 1 },
    { startLine: 5, endLine: 2 }
  ])
    await expect(run({ selection })).rejects.toThrow("Invalid read selection");
  expect(execute).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
  await expect(
    tool.execute(
      "cancel",
      { path: "sample.ts", selection: { startLine: 1 } },
      AbortSignal.abort(),
      undefined,
      context
    )
  ).rejects.toThrow();
  expect(readFile).not.toHaveBeenCalled();
  const error = new Error("read failed");
  execute.mockRejectedValueOnce(error);
  await expect(run({ selection: { startLine: 1 } })).rejects.toBe(error);
});

describe("native source windows", () => {
  it("reports partial selections without selecting a limit continuation notice", async () => {
    const { run } = fixture();
    const result = await run({ offset: 2, limit: 2, selection: { startLine: 1, endLine: 3 } });
    expect(lastText(sourceResult(result))).toContain("more lines in file");
    expect(lastText(result)).toMatch(/^.*\(partial\):/);
    expect(lastText(result).split("\n").slice(1)).toEqual(["alpha", "beta"]);
  });

  it("does not preview continuation notices when the selection is outside the read window", async () => {
    const result = await fixture().run({ limit: 1, selection: { startLine: 3 } });
    expect(lastText(sourceResult(result))).toContain("more lines in file");
    expect(lastText(result)).toMatch(/offset.*limit/);
    expect(lastText(result)).not.toContain("more lines in file");
  });

  it("uses the returned source boundary instead of the requested limit", async () => {
    const { run, execute } = fixture();
    const native: ReadResult = {
      content: [
        { type: "text", text: "alpha\nbeta\n\n[Showing lines 1-2. Use offset=3 to continue.]" }
      ],
      details: {
        truncation: {
          content: "alpha\nbeta",
          truncated: true,
          truncatedBy: "lines",
          totalLines: 3,
          totalBytes: 16,
          outputLines: 2,
          outputBytes: 10,
          lastLinePartial: false,
          firstLineExceedsLimit: false,
          maxLines: 2,
          maxBytes: 100
        }
      }
    };
    execute.mockResolvedValueOnce(native);
    const result = await run({ limit: 3, selection: { startLine: 3 } });
    expect(sourceResult(result).content).toEqual(native.content);
    expect(lastText(result)).toMatch(/offset.*limit/);
    expect(lastText(result)).not.toContain("Showing lines");
  });

  it("does not preview a diagnostic when the first source line exceeds the byte budget", async () => {
    const { run, execute } = fixture("x".repeat(60 * 1024));
    const result = await run({ selection: { startLine: 1 } });
    const native = await nativeResult(execute);
    expect(native.details?.truncation?.firstLineExceedsLimit).toBe(true);
    expect(lastText(result)).toMatch(/offset.*limit/);
    expect(lastText(result)).not.toContain(lastText(native));
  });

  it("preserves exact source controls, CRLF, and trailing empty selected lines in the model preview", async () => {
    const result = await fixture("before\r\n\t😀\u001b[31m\r\n\nend").run({
      selection: { startLine: 2, endLine: 3 }
    });
    expect(lastText(result).split("\n").slice(1).join("\n")).toBe("\t😀\u001b[31m\r\n");
  });
});

it("leaves native images and text-only image failure notes untouched", async () => {
  const validImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
    "base64"
  );

  for (const [bytes, mimeType, hasImage] of [
    [validImage, "image/png", true],
    [Buffer.from("invalid BMP"), "image/bmp", false]
  ] as const) {
    const base = createReadToolDefinition("/fallback", {
      autoResizeImages: false,
      operations: {
        access: async () => {},
        readFile: async () => bytes,
        detectImageMimeType: async () => mimeType
      }
    });
    const execute = vi.spyOn(base, "execute");
    const tool = createSelectiveReadTool(base);
    const result = await tool.execute(
      "image",
      { path: "sample.png", selection: { startLine: 1 } },
      undefined,
      undefined,
      context
    );
    const native = await nativeResult(execute);
    expect(native.content.some((block) => block.type === "image")).toBe(hasImage);

    if (!hasImage) {
      const note = native.content[0];
      if (note?.type !== "text") throw new Error("Expected a native image failure note");
      expect(note.text).toContain("Read image file [image/");
    }

    expect(result).toBe(native);
  }
});

it("restores preview provenance after serialization without hiding unmarked source", () => {
  const result: ReadResult = {
    content: [
      { type: "text", text: "Selected source preview:\nsource" },
      { type: "text", text: "preview" }
    ],
    details: { selectiveRead: { sourceBlocks: 1 } }
  };
  expect(sourceResult(structuredClone(result)).content).toEqual([result.content[0]]);
  const unmarked = { ...result, details: undefined };
  expect(sourceResult(unmarked)).toBe(unmarked);
  const invalidResults = [
    { ...result, details: { selectiveRead: { sourceBlocks: 10 } } },
    {
      ...result,
      content: [...result.content, { type: "text", text: "unowned" }],
      details: { selectiveRead: { sourceBlocks: 1 } }
    },
    {
      ...result,
      content: [
        ...result.content.slice(0, 1),
        { type: "image", data: "AA==", mimeType: "image/png" }
      ],
      details: { selectiveRead: { sourceBlocks: 1 } }
    }
  ] satisfies ReadResult[];
  for (const invalid of invalidResults) expect(sourceResult(invalid)).toBe(invalid);
});
