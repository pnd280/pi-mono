import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import type { ResultTextContext } from "../../contracts.ts";
import { TranscriptCoordinator } from "../../transcript/coordinator.ts";
import { nativeAdapter } from "../native/index.ts";
import { piSelectiveReadAdapter, selectiveReadDisplayAdapter as adapter } from "./index.ts";
import { selectiveReadToolInfo } from "./test-fixture.ts";

function result(text = "source", preview?: string): AgentToolResult<unknown> {
  return {
    content: [text, ...(preview === undefined ? [] : [preview])].map((text) => ({
      type: "text",
      text
    })),
    details: preview === undefined ? undefined : { selectiveRead: { sourceBlocks: 1 } }
  };
}

function context(
  value: AgentToolResult<unknown>,
  overrides: Partial<ResultTextContext> = {}
): ResultTextContext {
  return {
    result: value,
    contentIndex: 0,
    isError: false,
    isPartial: false,
    isCancelled: false,
    expanded: true,
    ...overrides
  };
}

it("requires selective-read ownership, the read name, and the current parameter schema", () => {
  const info = selectiveReadToolInfo();
  expect(piSelectiveReadAdapter(info)?.id).toBe("pi-read:read");
  expect(
    piSelectiveReadAdapter({
      ...info,
      sourceInfo: { ...info.sourceInfo, path: "C:\\extensions\\pi-read\\src\\index.ts" }
    })?.id
  ).toBe("pi-read:read");
  expect(
    piSelectiveReadAdapter({
      ...info,
      sourceInfo: {
        ...info.sourceInfo,
        path: "/cache/package/index.js",
        source: "npm:pi-read@0.1.0"
      }
    })?.id
  ).toBe("pi-read:read");
  for (const unsupported of [
    undefined,
    { ...info, name: "read-selection" },
    { ...info, parameters: {} },
    { ...info, parameters: { ...info.parameters, required: ["path", "selection"] } },
    ...["builtin", "sdk"].map((source) => ({
      ...info,
      sourceInfo: { ...info.sourceInfo, source }
    })),
    { ...info, sourceInfo: { ...info.sourceInfo, path: "/extensions/misc/src/read-selection.ts" } },
    {
      ...info,
      sourceInfo: { ...info.sourceInfo, path: "/extensions/pi-read-copy/index.ts" }
    }
  ])
    expect(piSelectiveReadAdapter(unsupported)).toBeUndefined();
});

it("normalizes display arguments without mutating retained input", () => {
  const args = {
    path: "a.ts",
    offset: null,
    limit: null,
    selection: { startLine: 2, startColumn: null, endLine: null, endColumn: null }
  };
  const before = structuredClone(args);
  const text = "first\nsecond\nthird";
  const value = result(text, "preview");

  expect(adapter.supports?.(args, value)).toBe(true);
  expect(
    adapter
      .invocation?.(args)
      .map((part) => part.text)
      .join("")
  ).toBe("a.ts · selection 2");
  expect(
    adapter.exploration?.(args, value)?.map(({ scope, parts }) => ({
      scope,
      text: parts.map((part) => part.text).join("")
    }))
  ).toEqual([{ scope: { kind: "file", value: "a.ts" }, text: "a.ts · selection 2" }]);
  expect(adapter.textParts?.(text, args, context(value))).toEqual([
    { kind: "output", text, selection: [{ line: 1, start: 0, end: 6 }] }
  ]);
  expect(args).toEqual(before);
});

it("rejects invalid arguments and the producer's invalid result contract", () => {
  const valid = { path: "a.ts", selection: { startLine: 1 } };
  expect(adapter.supports?.(valid, result("source", "preview"))).toBe(true);
  expect(adapter.supports?.({ path: "a.ts" }, result())).toBe(true);

  for (const args of [
    {},
    { path: 3 },
    { path: null },
    { path: "a.ts", limit: "3" },
    { path: "a.ts", selection: false },
    { ...valid, selection: { startLine: null } },
    { ...valid, selection: { startLine: 1, extra: null } },
    { ...valid, selection: { startLine: 0 } },
    { ...valid, selection: { startLine: 3, endLine: 2 } },
    { ...valid, selection: { startLine: 1, startColumn: 2, endColumn: 2 } },
    { ...valid, selection: { startLine: 1, extra: true } },
    { ...valid, selection: { startLine: Number.MAX_SAFE_INTEGER + 1 } }
  ]) {
    expect(adapter.supports?.(args, result())).toBe(false);
    expect(adapter.exploration?.(args)).toBeUndefined();
    expect(() => adapter.invocation?.(args)).not.toThrow();
  }

  expect(
    adapter.supports?.(valid, {
      ...result("source", "preview"),
      details: { selectiveRead: { sourceBlocks: 9 } }
    })
  ).toBe(false);
  expect(adapter.supports?.({ path: "a.ts" }, result("source", "preview"))).toBe(false);
  expect(adapter.exploration?.(valid, { ...result(), details: null })).toBeUndefined();
});

it("keeps window ranges separate from the selected coordinates and groups by the file", () => {
  const args = {
    path: "src/a.ts",
    offset: 8,
    limit: 20,
    selection: { startLine: 12, startColumn: 4, endLine: 15, endColumn: 9 }
  };
  expect(adapter.invocation?.(args)).toEqual([
    { kind: "path", text: "src/a.ts" },
    { kind: "range", text: ":8-27" },
    { kind: "annotation", text: " · selection 12:4-15:9" }
  ]);
  expect(adapter.exploration?.(args)?.[0]?.scope).toEqual({ kind: "file", value: "src/a.ts" });
});

it.each([
  { offset: 1, limit: 3, selection: { startLine: 1 } },
  { offset: null, limit: null, selection: null }
])("groups compatible retained reads and excludes malformed results: %j", (input) => {
  const coordinator = new TranscriptCoordinator("selective-read", { cwd: "/project" });
  const reference = (index: number) => ({
    messageTimestamp: 1,
    contentIndex: index,
    toolCallId: String(index)
  });

  try {
    const first = coordinator.add(
      reference(0),
      "ls",
      { path: "src" },
      nativeAdapter("ls")!,
      "historical"
    );
    const args = { path: "src/a.ts", ...input };
    const second = coordinator.add(reference(1), "read", args, adapter, "historical");
    expect(coordinator.group(first)?.members).toEqual([first, second]);
    const retained = result("source", input.selection ? "preview" : undefined);
    coordinator.result(second, retained, "success");
    expect(coordinator.group(first)?.members).toEqual([first, second]);
    coordinator.result(
      second,
      { ...retained, details: { selectiveRead: { sourceBlocks: 99 } } },
      "success"
    );
    expect(coordinator.group(first)).toBeUndefined();
    coordinator.result(second, retained, "success");
    expect(coordinator.group(first)?.members).toEqual([first, second]);
    expect(second.result).toBe(retained);
  } finally {
    coordinator.dispose();
  }
});

it("suppresses only the recorded preview block, preserving borrowed source and lookalikes", () => {
  const source = "Selected source preview:\nsource";
  const value = result(source, source);
  const args = { path: "a.ts", selection: { startLine: 2 } };
  const parts = adapter.textParts?.(
    value.content[0]!.type === "text" ? value.content[0]!.text : "",
    args,
    context(value)
  );
  expect(parts?.map((part) => part.text).join("")).toBe("Selected source preview:\nsource");
  expect(parts?.[0]?.selection).toEqual([{ line: 1, start: 0, end: 6 }]);
  expect(
    adapter.textParts?.(
      "Selected source preview:\nsource",
      args,
      context(value, { contentIndex: 1 })
    )
  ).toEqual([]);
  const unmarked = result("Selected source preview:\nsource");
  expect(
    adapter.textParts?.("Selected source preview:\nsource", args, context(unmarked))[0]?.text
  ).toContain("Selected source preview:");
  expect(value).toEqual(result(source, source));

  const notice = "[2 more lines in file. Use offset=2 to continue.]";
  const lookalike = result(`prefix\n\n${notice}\nsuffix`, `Selected source preview:\n\n${notice}`);
  // Selecting embedded source can put a native-looking trailer at the preview's end.
  expect(adapter.notices?.(lookalike, false)).toEqual([]);
});

it("maps code-point columns onto raw source without selecting continuation diagnostics", () => {
  const text = "\t😀界tail\nnext\n\n[3 more lines in file. Use offset=12 to continue.]";
  const value = result(text, "preview");
  const args = {
    path: "a.ts",
    offset: 10,
    limit: 2,
    selection: { startLine: 10, startColumn: 2, endLine: 20 }
  };
  const parts = adapter.textParts?.(text, args, context(value));
  expect(parts?.[0]?.selection).toEqual([
    { line: 0, start: 1, end: 8 },
    { line: 1, start: 0, end: 4 }
  ]);
  expect(parts?.filter((part) => part.kind === "warning")).toEqual([
    { kind: "warning", text: "[3 more lines in file. Use offset=12 to continue.]" }
  ]);
  const truncated = {
    ...value,
    details: { selectiveRead: { sourceBlocks: 1 }, truncation: { outputLines: 1, truncated: true } }
  };
  expect(adapter.textParts?.(text, args, context(truncated))[0]?.selection).toHaveLength(1);
  expect(adapter.notices?.(truncated, false)).toContainEqual({
    kind: "warning",
    text: "Tool output truncated by pi; expand to inspect retained output."
  });
  expect(
    adapter.textParts?.(text, { ...args, selection: { startLine: 50 } }, context(value))[0]
      ?.selection
  ).toEqual([]);
});

it("uses producer-owned per-block windows after native diagnostic separation", () => {
  const first = "alpha\n";
  const second = "\t😀界tail\nnext\n\n[3 more lines in file. Use offset=14 to continue.]";
  const value: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: first },
      { type: "text", text: second },
      { type: "text", text: "model preview" }
    ],
    details: { selectiveRead: { sourceBlocks: 2 }, truncation: { outputLines: 4, truncated: true } }
  };
  const before = structuredClone(value);
  const args = {
    path: "a.ts",
    offset: 10,
    limit: 1,
    selection: { startLine: 12, startColumn: 2, endLine: 20 }
  };

  expect(adapter.supports?.(args, value)).toBe(true);
  expect(adapter.textParts?.(first, args, context(value))[0]?.selection).toEqual([]);
  const parts = adapter.textParts?.(second, args, context(value, { contentIndex: 1 }));
  expect(parts?.[0]).toEqual({
    kind: "output",
    text: "\t😀界tail\nnext",
    selection: [
      { line: 0, start: 1, end: 8 },
      { line: 1, start: 0, end: 4 }
    ]
  });
  expect(parts?.filter((part) => part.kind === "warning")).toEqual([
    { kind: "warning", text: "[3 more lines in file. Use offset=14 to continue.]" }
  ]);
  expect(adapter.textParts?.("model preview", args, context(value, { contentIndex: 2 }))).toEqual(
    []
  );
  expect(value).toEqual(before);
});

it("keeps embedded native-looking source selected, but separates exact trailing native envelopes", () => {
  const notice = "[2 more lines in file. Use offset=2 to continue.]";
  const args = { path: "a.ts", selection: { startLine: 3 } };
  const embedded = `prefix\n\n${notice}\nsuffix`;
  expect(adapter.textParts?.(embedded, args, context(result(embedded)))[0]?.selection).toEqual([
    { line: 2, start: 0, end: notice.length }
  ]);
  const trailing = `prefix\n\n${notice}`;
  const parts = adapter.textParts?.(trailing, args, context(result(trailing)));
  expect(parts?.[0]?.selection).toEqual([]);
  expect(parts?.at(-1)).toEqual({ kind: "warning", text: notice });
});

it("retains native image, partial, error, and cancellation presentation without highlighting", () => {
  const args = { path: "a.ts", selection: { startLine: 1 } };
  const value = result("diagnostic");
  for (const flags of [{ isError: true }, { isPartial: true }, { isCancelled: true }])
    expect(
      adapter
        .textParts?.("diagnostic", args, context(value, flags))
        .every((part) => part.selection === undefined)
    ).toBe(true);
  const image: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: "Read image file [image/png]" },
      { type: "image", mimeType: "image/png", data: "AA==" }
    ],
    details: undefined
  };
  expect(adapter.supports?.(args, image)).toBe(true);
  const imageParts = adapter.textParts?.(
    "Read image file [image/png]",
    args,
    context(image, { hasImages: true })
  );
  expect(imageParts?.map((part) => part.text).join("")).toBe("Read image file [image/png]");
  expect(imageParts).toContainEqual({ kind: "value", text: "image/png" });
  expect(adapter.imageCaptionMimeType?.("Read image file [image/png]")).toBe("image/png");
  const invalid = { ...value, details: { selectiveRead: { sourceBlocks: 100 } } };
  expect(adapter.textParts?.("diagnostic", args, context(invalid))).toEqual([
    { kind: "output", text: "diagnostic" }
  ]);
});
