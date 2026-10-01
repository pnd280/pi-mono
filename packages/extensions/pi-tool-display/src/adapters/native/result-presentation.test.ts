import { expect, it } from "vite-plus/test";

import {
  nativeResultParts,
  nativeResultNotices,
  nativeReadNotices
} from "./result-presentation.ts";

it("reports backend omissions and saved-output references", () => {
  const notices = nativeResultNotices({
    truncation: { truncated: true },
    fullOutputPath: "/tmp/output",
    matchLimitReached: 20,
    linesTruncated: true
  });
  expect(notices).toContainEqual({
    kind: "reference",
    label: "Saved output",
    value: "/tmp/output"
  });
  expect(notices).toContainEqual({ kind: "warning", text: "Match limit reached." });
  expect(
    notices.filter((notice) => notice.kind === "warning" && notice.text.includes("truncated"))
  ).toHaveLength(2);
  expect(nativeResultNotices(undefined)).toEqual([]);
});

it("requires a native image envelope before promoting image warnings", () => {
  const note =
    "[Current model does not support images. The image will be omitted from this request.]";
  const omitted = "[Image omitted: could not be converted to a supported inline image format.]";
  const image = { type: "image" as const, data: "private", mimeType: "image/png" };

  for (const text of [
    note,
    omitted,
    `file prose\nRead image file [image/png]\n${note}`,
    `Read image file [image/png] literal prose\n${note}`,
    `Read image file [image/png]\n${note} literal prose`
  ]) {
    expect(
      nativeReadNotices({ content: [{ type: "text", text }, image], details: undefined })
    ).toEqual([]);
  }

  for (const text of [
    `Read image file [image/png]\n${note}`,
    `Read image file [image/png]\n${omitted}\nliteral prose`,
    `Read image file [image/png]\nliteral prose\n${omitted}`,
    `Read image file [image/png]\n${omitted}\n${note}\n`
  ])
    expect(nativeReadNotices({ content: [{ type: "text", text }], details: undefined })).toEqual(
      []
    );
  const text = `Read image file [image/bmp]\n${omitted}\n${note}`;
  expect(nativeReadNotices({ content: [{ type: "text", text }], details: undefined })).toEqual([
    { kind: "warning", text: omitted },
    { kind: "warning", text: note }
  ]);
  const parts = nativeResultParts("read", text, {}, complete);
  expect(parts.map((part) => part.text).join("")).toBe(text);
  expect(parts.filter((part) => part.kind === "warning").map((part) => part.text)).toEqual([
    omitted,
    note
  ]);
});

const complete = {
  result: { content: [], details: undefined },
  contentIndex: 0,
  isError: false,
  isPartial: false,
  isCancelled: false,
  expanded: false
};
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
    ["bash", "\x1b[32mstdout\x1b[0m\n\nCommand aborted", { ...complete, isError: true }, "", ""],
    ["bash", "(no output)", { ...complete, isPartial: true }, "", ""],
    ["bash", "literal (no output)\nCommand exited with code 42\n", complete, "", ""],
    ["read", "user prose\n\n[Showing lines unrelated to the native contract]", complete, "", ""],
    ["read", "retained\n\n[1.5 more lines in file. Use offset=2e+ to continue.]", complete, "", ""],
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
