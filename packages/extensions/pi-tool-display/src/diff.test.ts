import { expect, it } from "vite-plus/test";

import { computeChange, parseRetainedPatch, OBSERVATION_BYTES, PATCH_BYTES } from "./diff.ts";

it("retains parsed patches and established creation/modification facts", () => {
  const created = computeChange("a.ts", "", "created\r\n", "creation");
  expect(created).toMatchObject({ kind: "change", availability: "available", change: "creation" });
  expect(parseRetainedPatch(created.patch!)?.added).toBe(1);
  const modified = computeChange("unicode.txt", "before\uFFFD\n", "after\n", "modification");
  expect(modified.change).toBe("modification");
  expect(parseRetainedPatch(modified.patch!)?.hunks[0]?.lines).toEqual([
    { kind: "removed", text: "before\uFFFD", oldLine: 1 },
    { kind: "added", text: "after", newLine: 1 }
  ]);
});

it("applies display retention/observation limits and translates bounded-diff statuses", () => {
  expect(parseRetainedPatch("@@ -0,0 +1 @@\n+" + "x".repeat(PATCH_BYTES))).toBeUndefined();
  expect(
    computeChange("a", "before", "a".repeat(OBSERVATION_BYTES + 1), "modification")
  ).toMatchObject({
    availability: "unavailable",
    reason: "Change exceeds the 64 KiB observation limit."
  });
  expect(
    computeChange("a", "old\n".repeat(2500), "new\n".repeat(2500), "modification")
  ).toMatchObject({
    availability: "unavailable",
    reason: "Diff generation exceeded 50 ms or 2000 changed lines."
  });
  expect(computeChange("a", "\0", "new", "modification")).toMatchObject({
    availability: "unavailable",
    reason: "Binary content."
  });
});
