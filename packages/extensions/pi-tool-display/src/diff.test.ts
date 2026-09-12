import { applyPatch } from "diff";
import { expect, it } from "vite-plus/test";

import { computeChange, parsePatch, OBSERVATION_BYTES } from "./diff.ts";
it("retains native hunk boundaries and separate old/new counters", () => {
  const parsed = parsePatch(
    "--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +10,3 @@ first section\n-old\n+new\n+extra\n context\n@@ -99 +100 @@\n-last\n+final\n"
  );
  expect(parsed).toMatchObject({ added: 3, removed: 2 });
  expect(parsed?.hunks).toEqual([
    {
      lines: [
        { kind: "removed", text: "old", oldLine: 10 },
        { kind: "added", text: "new", newLine: 10 },
        { kind: "added", text: "extra", newLine: 11 },
        { kind: "context", text: "context", oldLine: 11, newLine: 12 }
      ]
    },
    {
      lines: [
        { kind: "removed", text: "last", oldLine: 99 },
        { kind: "added", text: "final", newLine: 100 }
      ]
    }
  ]);
  expect(parsePatch("+1 legacy")).toBeUndefined();
  expect(parsePatch("@@ -1,2 +1 @@\n-old\n+new\n")).toBeUndefined();
});
it("retains missing-newline markers without treating them as changed lines", () => {
  expect(
    parsePatch("@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new")?.hunks[0]?.lines
  ).toEqual([
    { kind: "removed", text: "old", oldLine: 1, noNewline: true },
    { kind: "added", text: "new", newLine: 1 }
  ]);
});

it("rejects malformed, multi-file, and oversized patches without trusting hunk counts", () => {
  for (const patch of [
    "+1 legacy",
    "@@ -1,2 +1 @@\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n+extra\n",
    "@@ -0 +0 @@\n-old\n+new\n",
    "@@ -9007199254740992 +1 @@\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n\\ Not a newline marker\n",
    "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n--- c\n+++ d\n@@ -1 +1 @@\n-c\n+d\n",
    "@@ -1 +1 @@\n-" + "x".repeat(128 * 1024) + "\n+new\n"
  ])
    expect(parsePatch(patch), patch.slice(0, 100)).toBeUndefined();
  expect(parsePatch("--- a\r\n+++ b\r\n")).toEqual({ hunks: [], added: 0, removed: 0 });
  expect(parsePatch("@@ -1 +0,0 @@\r\n-deleted\r\n")).toMatchObject({ added: 0, removed: 1 });
});

it("retains valid replacement characters in decoded before-states", () => {
  const change = computeChange("unicode.txt", "before\uFFFD\n", "after\n", "modification");
  expect(change.availability).toBe("available");
  expect(parsePatch(change.patch!)?.hunks[0]?.lines).toEqual([
    { kind: "removed", text: "before\uFFFD", oldLine: 1 },
    { kind: "added", text: "after", newLine: 1 }
  ]);
});

it("generates small changes in large files without a whole-file line-product limit", () => {
  const before = Array.from({ length: 2500 }, (_, index) => `line ${index}\n`).join("");
  const after = before.replace("line 1250\n", "edited middle\n");
  const change = computeChange("large.txt", before, after, "modification");
  expect(change.availability).toBe("available");
  expect(parsePatch(change.patch!)).toMatchObject({ added: 1, removed: 1 });
  expect(applyPatch(before, change.patch!)).toBe(after);
});

it("generates compatible patches for creation, deletion, CRLF, and missing final newlines", () => {
  for (const [before, after] of [
    ["", "created\n"],
    ["removed\n", ""],
    ["before", "after\n"],
    ["before\r\ncontext\r\n", "after\r\ncontext\r\n"],
    ["same\n", "same\n"]
  ] as const) {
    const change = computeChange("space and 界.txt", before, after, "modification");
    expect(change.availability).toBe("available");
    expect(parsePatch(change.patch!)).toBeDefined();
    expect(applyPatch(before.replaceAll("\r\n", "\n"), change.patch!)).toBe(
      after.replaceAll("\r\n", "\n")
    );
  }
});

it("bounds generation and distinguishes established creation from modification", () => {
  const created = computeChange("a.ts", "", "created\r\n", "creation");
  expect(created.change).toBe("creation");
  expect(parsePatch(created.patch!)?.added).toBe(1);
  expect(computeChange("a", "before", "after", "modification").change).toBe("modification");
  expect(
    computeChange("a", "before", "a".repeat(OBSERVATION_BYTES + 1), "modification").availability
  ).toBe("unavailable");
  expect(
    computeChange("a", "old\n".repeat(2500), "new\n".repeat(2500), "modification").availability
  ).toBe("unavailable");
  expect(computeChange("a", "\0", "new", "modification").availability).toBe("unavailable");
});
