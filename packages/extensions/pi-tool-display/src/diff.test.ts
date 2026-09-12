import { expect, it } from "vite-plus/test";

import { computeChange, parsePatch, OBSERVATION_BYTES } from "./diff.ts";
it("reads native patches with separate old/new counters and hunk separators", () => {
  const parsed = parsePatch(
    "--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +10,3 @@\n-old\n+new\n+extra\n context\n@@ -99 +100 @@\n-last\n+final\n"
  );
  expect(parsed).toMatchObject({ added: 3, removed: 2 });
  expect(parsed?.lines).toEqual([
    { kind: "removed", text: "old", oldLine: 10 },
    { kind: "added", text: "new", newLine: 10 },
    { kind: "added", text: "extra", newLine: 11 },
    { kind: "context", text: "context", oldLine: 11, newLine: 12 },
    { kind: "separator", text: "⋮" },
    { kind: "removed", text: "last", oldLine: 99 },
    { kind: "added", text: "final", newLine: 100 }
  ]);
  expect(parsePatch("+1 legacy")).toBeUndefined();
  expect(parsePatch("@@ -1,2 +1 @@\n-old\n+new\n")).toBeUndefined();
});
it("retains valid replacement characters in decoded before-states", () => {
  const change = computeChange("unicode.txt", "before\uFFFD\n", "after\n", "modification");
  expect(change.availability).toBe("available");
  expect(parsePatch(change.patch!)?.lines).toEqual([
    { kind: "removed", text: "before\uFFFD", oldLine: 1 },
    { kind: "added", text: "after", newLine: 1 }
  ]);
});

it("bounds computation before diffing and distinguishes established creation from modification", () => {
  const created = computeChange("a.ts", "", "created\r\n", "creation");
  expect(created.change).toBe("creation");
  expect(parsePatch(created.patch!)?.added).toBe(1);
  expect(computeChange("a", "before", "after", "modification").change).toBe("modification");
  expect(
    computeChange("a", "before", "a".repeat(OBSERVATION_BYTES + 1), "modification").availability
  ).toBe("unavailable");
  expect(
    computeChange("a", "old\n".repeat(201), "new\n".repeat(201), "modification").availability
  ).toBe("unavailable");
  expect(computeChange("a", "\0", "new", "modification").availability).toBe("unavailable");
});
