import { expect, it } from "vite-plus/test";

import { parsePatch } from "./patch.ts";

const maxBytes = 128 * 1024;

it("rejects malformed and multi-file patches without trusting hunk counts", () => {
  for (const patch of [
    "+1 legacy",
    "@@ -1,2 +1 @@\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n+extra\n",
    "@@ -1 +1 @@\n context only\n",
    "@@ -0 +0 @@\n-old\n+new\n",
    "@@ -9007199254740992 +1 @@\n-old\n+new\n",
    "@@ -1 +1 @@\n-old\n+new\n\\ Not a newline marker\n",
    "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n--- c\n+++ d\n@@ -1 +1 @@\n-c\n+d\n"
  ])
    expect(parsePatch(patch, maxBytes), patch.slice(0, 100)).toBeUndefined();
});

it.each([
  "@@ -1 +1 @@\n-a\n+b\n@@ -1 +2 @@\n-c\n+d\n",
  "@@ -1 +1 @@\n-a\n+b\n@@ -2 +1 @@\n-c\n+d\n",
  "@@ -2 +2 @@\n-a\n+b\n@@ -1 +1 @@\n-c\n+d\n",
  "@@ -1,0 +2 @@\n+a\n@@ -1 +3 @@\n-b\n+c\n"
])("rejects overlapping or reversed hunk coordinates: %s", (patch) => {
  expect(parsePatch(patch, maxBytes)).toBeUndefined();
});

it("enforces the caller's byte bound, including multibyte source", () => {
  const patch = "@@ -0,0 +1 @@\n+界\n";
  expect(parsePatch(patch, Buffer.byteLength(patch))).toBeDefined();
  expect(parsePatch(patch, Buffer.byteLength(patch) - 1)).toBeUndefined();
});
