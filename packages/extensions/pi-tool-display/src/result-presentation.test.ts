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
  expect(parts.map((part) => part.text).join("")).toBe(text);
  expect(parts.filter((part) => part.kind === "warning")).toEqual([
    { kind: "warning", text: cursor }
  ]);
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
  const capped = '[10+ matches (refine patterns). More available. cursor="next" to continue]';
  expect(fffResultParts(`example.ts\n 1: match\n\n${capped}`, "multi", complete)).toContainEqual({
    kind: "warning",
    text: capped
  });
});
