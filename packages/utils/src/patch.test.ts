import { expect, it } from "vite-plus/test";

import { parsePatch } from "./patch.ts";

const maxBytes = 128 * 1024;

it("retains hunk boundaries and separate old/new counters", () => {
  const parsed = parsePatch(
    "--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +10,3 @@ first section\n-old\n+new\n+extra\n context\n@@ -99 +100 @@\n-last\n+final\n",
    maxBytes
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
});

it("retains missing-newline markers without treating them as changed lines", () => {
  expect(
    parsePatch("@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new", maxBytes)?.hunks[0]?.lines
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
    "@@ -1 +1 @@\n context only\n",
    "@@ -0 +0 @@\n-old\n+new\n",
    "@@ -9007199254740992 +1 @@\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n\\ Not a newline marker\n",
    "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n--- c\n+++ d\n@@ -1 +1 @@\n-c\n+d\n",
    "@@ -1 +1 @@\n-" + "x".repeat(maxBytes) + "\n+new\n"
  ])
    expect(parsePatch(patch, maxBytes), patch.slice(0, 100)).toBeUndefined();
  expect(parsePatch("--- a\r\n+++ b\r\n", maxBytes)).toEqual({ hunks: [], added: 0, removed: 0 });
  expect(parsePatch("@@ -1 +0,0 @@\r\n-deleted\r\n", maxBytes)).toMatchObject({
    added: 0,
    removed: 1
  });
});

it.each([
  "@@ -1 +1 @@\n-a\n+b\n@@ -1 +2 @@\n-c\n+d\n",
  "@@ -1 +1 @@\n-a\n+b\n@@ -2 +1 @@\n-c\n+d\n",
  "@@ -2 +2 @@\n-a\n+b\n@@ -1 +1 @@\n-c\n+d\n",
  "@@ -1,0 +2 @@\n+a\n@@ -1 +3 @@\n-b\n+c\n"
])("rejects overlapping or reversed hunk coordinates: %s", (patch) => {
  expect(parsePatch(patch, maxBytes)).toBeUndefined();
});

it("accepts adjacent hunks and zero-length insertion/deletion anchors", () => {
  expect(parsePatch("@@ -1 +1 @@\n-a\n+b\n@@ -2 +2 @@\n-c\n+d\n", maxBytes)).toMatchObject({
    added: 2,
    removed: 2
  });
  expect(parsePatch("@@ -0,0 +1 @@\n+a\n@@ -1 +1,0 @@\n-b\n", maxBytes)).toMatchObject({
    added: 1,
    removed: 1
  });
});

it("enforces the caller's byte bound, including multibyte source", () => {
  const patch = "@@ -0,0 +1 @@\n+界\n";
  expect(parsePatch(patch, Buffer.byteLength(patch))).toBeDefined();
  expect(parsePatch(patch, Buffer.byteLength(patch) - 1)).toBeUndefined();
  expect(() => parsePatch(patch, Infinity)).toThrow(RangeError);
});
