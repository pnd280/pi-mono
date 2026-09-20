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
    base,
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

it("registers a native read replacement with strict selection parameters and prompt guidance", () => {
  const registerTool = vi.fn();
  register({ registerTool });
  expect(registerTool).toHaveBeenCalledOnce();
  const { tool, base } = fixture();
  expect(tool.name).toBe("read");
  expect(tool.parameters.properties.path).toEqual(base.parameters.properties.path);
  expect(tool.parameters.properties.selection).toMatchObject({
    type: "object",
    additionalProperties: false,
    required: ["startLine"],
    properties: { startLine: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } }
  });
  expect(tool.promptSnippet).toBe(base.promptSnippet);
  expect(tool.promptGuidelines).toEqual(expect.arrayContaining(base.promptGuidelines!));
  expect(tool.promptGuidelines?.join(" ")).toContain("read.selection");
  expect(tool.renderCall).toBeTypeOf("function");
  expect(tool.renderResult).toBeTypeOf("function");
});

it("accepts the generated selection schema through Pi's argument validator", () => {
  const { tool } = fixture();
  const args = { path: "sample.ts", selection: { startLine: 2, endColumn: 4 } };
  expect(validateToolArguments(tool, fauxToolCall("read", args, { id: "valid" }))).toEqual(args);
  expect(() => {
    validateToolArguments(
      tool,
      fauxToolCall("read", { path: "sample.ts", selection: { startLine: 0 } }, { id: "invalid" })
    );
  }).toThrow("Validation failed");
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
  expect(lastText(result)).toBe("Selected source preview:\nlpha\nbe");
  expect(sourceResult(result).content).toEqual(native.content);
  expect(result.details?.selectiveRead).toEqual({ sourceBlocks: native.content.length });
  expect(readFile).toHaveBeenCalledExactlyOnceWith("/session/sample.ts");
  expect(execute.mock.calls[0]![1]).toEqual({ path: "sample.ts" });
});

it("rejects invalid selections before reading, and preserves native errors and cancellation", async () => {
  const { run, execute, tool, readFile } = fixture();
  await expect(run({ selection: { startLine: 5, endLine: 2 } })).rejects.toThrow(
    "Invalid read selection"
  );
  expect(execute).not.toHaveBeenCalled();
  await expect(
    tool.execute(
      "cancel",
      { path: "sample.ts", selection: { startLine: 1 } },
      AbortSignal.abort(),
      undefined,
      context
    )
  ).rejects.toThrow("aborted");
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
    expect(lastText(result)).toBe("Selected source preview (partial):\nalpha\nbeta");
  });

  it.each([1, 1.5, 0])("does not preview continuation notices with limit %s", async (limit) => {
    const result = await fixture().run({ limit, selection: { startLine: 3 } });
    expect(lastText(result)).toContain("no text in this read window");
    expect(lastText(result)).not.toContain("more lines in file");
  });

  it("uses the native truncation boundary instead of the requested limit", async () => {
    const { run, execute } = fixture(
      Array.from({ length: 2005 }, (_, index) => `line ${index + 1}`).join("\n")
    );
    const result = await run({ limit: 2003, selection: { startLine: 2001 } });
    const native = await nativeResult(execute);
    expect(result.details?.truncation).toBe(native.details?.truncation);
    expect(result.details?.truncation?.outputLines).toBe(2000);
    expect(lastText(result)).toContain("no text in this read window");
  });

  it("does not preview a diagnostic when the first source line exceeds the byte budget", async () => {
    const result = await fixture("x".repeat(60 * 1024)).run({ selection: { startLine: 1 } });
    expect(result.details?.truncation?.firstLineExceedsLimit).toBe(true);
    expect(lastText(result)).toContain("no text in this read window");
  });

  it("preserves exact source controls, CRLF, and trailing empty selected lines in the model preview", async () => {
    const result = await fixture("before\r\n\t😀\u001b[31m\r\n\nend").run({
      selection: { startLine: 2, endLine: 3 }
    });
    expect(lastText(result)).toBe("Selected source preview:\n\t😀\u001b[31m\r\n");
  });
});

it("leaves image results and text-only image failure notes untouched", async () => {
  const { run, execute } = fixture();
  const results: ReadResult[] = [
    {
      content: [
        { type: "text", text: "Read image file [image/png]" },
        { type: "image", data: "AA==", mimeType: "image/png" }
      ],
      details: undefined
    },
    {
      content: [{ type: "text", text: "Read image file [image/png]\nDecoding failed" }],
      details: undefined
    }
  ];

  for (const result of results) {
    execute.mockResolvedValueOnce(result);
    expect(await run({ selection: { startLine: 1 } })).toBe(result);
  }
});

it("restores preview provenance after serialization without hiding unmarked source", () => {
  const result: ReadResult = {
    content: [
      { type: "text", text: "source" },
      { type: "text", text: "preview" }
    ],
    details: { selectiveRead: { sourceBlocks: 1 } }
  };
  expect(sourceResult(structuredClone(result)).content).toEqual([result.content[0]]);
  const unmarked = { ...result, details: undefined };
  expect(sourceResult(unmarked)).toBe(unmarked);
  const invalid = { ...result, details: { selectiveRead: { sourceBlocks: 10 } } };
  expect(sourceResult(invalid)).toBe(invalid);
});
