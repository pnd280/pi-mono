import { expect, it } from "vite-plus/test";

import { fffResultParts, fffTextNotices, nativeResultParts } from "./result-presentation.ts";

const complete = { isError: false, isPartial: false };
it("recognizes native envelopes while preserving supplied bytes and literal lookalikes", () => {
  for (const [name, text, context, annotation, warning] of [
    ["bash", "(no output)", complete, "(no output)", ""],
    ["grep", "No matches found", complete, "No matches found", ""],
    ["ls", "(empty directory)", complete, "(empty directory)", ""],
    ["find", "No files found matching pattern", complete, "No files found matching pattern", ""],
    [
      "read",
      "retained\n\n[2 more lines in file. Use offset=3 to continue.]",
      complete,
      "",
      "[2 more lines in file. Use offset=3 to continue.]"
    ],
    [
      "bash",
      "\x1b[32mstdout\x1b[0m\n\nCommand aborted",
      { ...complete, isError: true },
      "",
      "Command aborted"
    ],
    ["bash", "(no output)", { ...complete, isPartial: true }, "", ""],
    ["bash", "literal (no output)\nCommand exited with code 42\n", complete, "", ""],
    ["read", "user prose\n\n[Showing lines unrelated to the native contract]", complete, "", ""],
    ["read", "retained\n\n[2 more lines in file. Use offset=3 to continue.]\n", complete, "", ""]
  ] as const) {
    const parts = nativeResultParts(name, text, {}, context);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(
      parts
        .filter((part) => part.kind === "annotation")
        .map((part) => part.text)
        .join("")
    ).toBe(annotation);
    expect(
      parts
        .filter((part) => part.kind === "warning")
        .map((part) => part.text)
        .join("")
    ).toBe(warning);
  }
});
it("separates native confirmation and image labels from values and warnings", () => {
  const args = { path: "example.txt", edits: [{ oldText: "before", newText: "after" }] };
  const text = "Successfully replaced 1 block(s) in example.txt.";
  expect(nativeResultParts("edit", text, args, complete)).toEqual([
    { kind: "annotation", text: "Successfully replaced 1 block(s) in " },
    { kind: "value", text: "example.txt" },
    { kind: "annotation", text: "." }
  ]);
  expect(nativeResultParts("edit", text, { ...args, path: "other.txt" }, complete)).toEqual([
    { kind: "output", text }
  ]);
  const note =
    "[Current model does not support images. The image will be omitted from this request.]";
  const image = `Read image file [image/png]\n${note}`;
  const parts = nativeResultParts("read", image, args, { ...complete, hasImages: true });
  expect(parts.map((part) => part.text).join("")).toBe(image);
  expect(parts).toContainEqual({ kind: "warning", text: note });
  expect(nativeResultParts("read", image, args, complete)).toEqual([
    { kind: "output", text: image }
  ]);
});
it("distinguishes FFF metadata and diagnostics from matching source text", () => {
  const rejected =
    "Pattern '.*' matches everything \u2014 grep needs a concrete substring or identifier. Example: `pattern: 'MyClass'` or `pattern: 'export function'`.";
  expect(fffResultParts(rejected, "grep", complete)).toEqual([{ kind: "warning", text: rejected }]);
  expect(
    fffTextNotices(
      { content: [{ type: "text", text: rejected }], details: { totalMatched: 0, totalFiles: 0 } },
      "grep"
    )
  ).toEqual([{ kind: "warning", text: rejected }]);
  const cursor = '[Continue with cursor="fff_c1"]';
  const text = `example.ts  [staged_modified in git]\n 4: literal No matches found\n 5- [Invalid regex: source text]\n\n${cursor}`;
  const parts = fffResultParts(text, "grep", complete);
  expect(parts.map((part) => part.text).join("")).toBe(text.slice(0, text.indexOf("\n\n")));
  expect(parts.filter((part) => part.kind === "warning")).toEqual([]);
  expect(parts.filter((part) => part.kind === "annotation").map((part) => part.text)).toEqual([
    "  [staged_modified in git]",
    " 4: ",
    " 5- "
  ]);
  expect(
    fffResultParts(`${text}\n`, "grep", complete)
      .map((part) => part.text)
      .join("")
  ).toBe(`${text}\n`);
  expect(fffResultParts("No matches found", "grep", complete)).toEqual([
    { kind: "annotation", text: "No matches found" }
  ]);
});
it.each([
  ["find", '[32 more matches available. cursor="3" to continue]'],
  ["find", '[1 more match available. cursor="4" to continue]'],
  ["grep", '[Continue with cursor="fff_c1"]'],
  ["multi", '[More available. cursor="fff_c2" to continue]'],
  ["multi", '[10+ matches (refine patterns). More available. cursor="next" to continue]'],
  ["multi", "[10+ matches (refine patterns)]"]
] as const)("hides %s pagination only in complete successful FFF envelopes: %s", (kind, notice) => {
  const content = kind === "find" ? "example.ts" : "example.ts\n 1: retained match";
  const text = `${content}\n\n${notice}`;
  const supplied = { content: [{ type: "text" as const, text }], details: undefined };
  expect(
    fffResultParts(text, kind, complete)
      .map((part) => part.text)
      .join("")
  ).toBe(content);
  expect(fffTextNotices(supplied, kind)).toEqual([]);
  expect(fffResultParts(notice, kind, complete)).toEqual([]);
  for (const context of [
    { ...complete, isError: true },
    { ...complete, isPartial: true }
  ]) {
    expect(
      fffResultParts(text, kind, context)
        .map((part) => part.text)
        .join("")
    ).toBe(text);
  }
  for (const literal of [`example.ts\n 1: ${notice}`, `${text}\n\nnext-file.ts`, `${text}\n`]) {
    expect(
      fffResultParts(literal, kind, complete)
        .map((part) => part.text)
        .join("")
    ).toBe(literal);
  }
  expect(supplied.content[0]!.text).toBe(text);
});
it.each(["unclosed group", "regex parse error:\n    (\n    ^\nerror: unclosed group"])(
  "retains FFF fallback diagnostics without their combined pagination instruction: %s",
  (error) => {
    const warning = `[Invalid regex: ${error}, used literal match]`;
    const combined = `[Invalid regex: ${error}, used literal match. Continue with cursor="fff_c1"]`;
    const supplied = {
      content: [{ type: "text" as const, text: `example.ts\n 1: match\n\n${combined}` }],
      details: undefined
    };
    expect(fffTextNotices(supplied, "grep")).toEqual([{ kind: "warning", text: warning }]);
    expect(
      fffResultParts(supplied.content[0]!.text, "grep", complete)
        .map((part) => part.text)
        .join("")
    ).toBe(`example.ts\n 1: match\n\n${warning}`);
    for (const diagnostic of [
      '[Query "needle" produced only weak scattered fuzzy matches. Output capped at 5/100.]',
      "[0 exact matches. Maybe you meant this?]\nexample.ts\n 1: match"
    ]) {
      expect(
        fffResultParts(diagnostic, "find", complete)
          .map((part) => part.text)
          .join("")
      ).toBe(diagnostic);
      expect(
        fffTextNotices(
          { content: [{ type: "text", text: diagnostic }], details: undefined },
          "find"
        )
      ).not.toEqual([]);
    }
  }
);
