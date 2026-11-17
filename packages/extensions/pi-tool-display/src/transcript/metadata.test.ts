import { expect, it } from "vite-plus/test";

import { parseCallRecord } from "./metadata.ts";

const call = { entry: "a1b2c3d4", toolCallId: "toolu_1" };

it("accepts call facts that Pi does not record", () => {
  const facts = {
    applied: true,
    change: { kind: "modification", patch: "@@ -1 +1 @@\n-a\n+b\n" }
  };
  expect(parseCallRecord({ ...call, ...facts })).toEqual({ ...call, ...facts });
});

it.each([
  { entry: "" },
  { toolCallId: 1 },
  { applied: false },
  { cancelled: false },
  { outcome: "cancelled" },
  { exitCode: 1.5 },
  { timedOut: "false" },
  { change: { kind: "modification" } },
  { change: { kind: "creation", unavailable: "Binary content." } },
  { change: { kind: "creation", patch: "é".repeat(70 * 1024) } }
])("rejects call records with invalid fields: %j", (fields) => {
  expect(parseCallRecord({ ...call, ...fields })).toBeUndefined();
});

it("bounds the original record, including unknown fields", () => {
  const value = { ...call, cancelled: true };
  // Unknown fields are not returned, but they count toward the limit.
  expect(parseCallRecord({ ...value, extra: "x" })).toEqual(value);
  expect(parseCallRecord({ ...value, extra: "é".repeat(90 * 1024) })).toBeUndefined();
});
