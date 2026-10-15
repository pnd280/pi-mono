import { expect, it } from "vite-plus/test";

import { selectionSchema } from "./selection.ts";

it("rejects unknown fields and invalid coordinates or ranges", () => {
  for (const input of [
    null,
    {},
    { startLine: "1" },
    { startLine: 0 },
    { startLine: 1.5 },
    { startLine: Number.MAX_SAFE_INTEGER + 1 },
    { startLine: 1, startColumn: 0 },
    { startLine: 1, endLine: null },
    { startLine: 3, endLine: 2 },
    { startLine: 3, startColumn: 5, endColumn: 5 },
    { startLine: 3, startColumn: 5, endColumn: 4 },
    { startLine: 1, endColumn: Infinity },
    { startLine: 1, extra: true }
  ])
    expect(selectionSchema.safeParse(input).success).toBe(false);
});
