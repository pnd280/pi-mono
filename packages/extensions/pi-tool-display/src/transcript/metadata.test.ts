import { expect, it } from "vite-plus/test";

import { parseCallRecord, parseWriterRecord } from "./metadata.ts";

const call = { entry: "a1b2c3d4", toolCallId: "toolu_1" };

it.each([
  { cancelled: true },
  { outcome: "failure" },
  { exitCode: 2 },
  { exitCode: null, cancelled: true },
  { timedOut: true },
  { applied: true, change: { kind: "modification", patch: "@@ -1 +1 @@\n-a\n+b\n" } },
  { change: { kind: "creation" } },
  { change: { kind: "creation", patch: "@@ -0,0 +1 @@\n+a\n" } },
  { change: { kind: "unavailable", reason: "binary" } }
])("accepts call facts that Pi does not record: %j", (facts) => {
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
  { change: { kind: "unavailable", reason: "Binary content." } },
  { change: { kind: "creation", patch: "x".repeat(128 * 1024 + 1) } }
])("rejects call records with invalid fields: %j", (fields) => {
  expect(parseCallRecord({ ...call, ...fields })).toBeUndefined();
});

it("bounds the original record, including unknown fields", () => {
  const value = { ...call, cancelled: true };
  // Unknown fields are not returned, but they count toward the limit.
  expect(parseCallRecord({ ...value, extra: "x" })).toEqual(value);
  expect(parseCallRecord({ ...value, extra: "x".repeat(160 * 1024) })).toBeUndefined();
  expect(
    parseWriterRecord({
      writer: "3f0c4b1e-8f5a-4c3d-9b2a-1e2f3a4b5c6d",
      cwd: "/work",
      extra: "x".repeat(160 * 1024)
    })
  ).toBeUndefined();
  expect(
    parseCallRecord({
      ...value,
      cycle: {
        get self() {
          return this;
        }
      }
    })
  ).toBeUndefined();
});

it("accepts writer records only with a UUID and a cwd", () => {
  const writer = { writer: "3f0c4b1e-8f5a-4c3d-9b2a-1e2f3a4b5c6d", cwd: "/work" };
  expect(parseWriterRecord(writer)).toEqual(writer);
  expect(parseWriterRecord({ ...writer, writer: "../other" })).toBeUndefined();
  expect(parseWriterRecord({ ...writer, cwd: "" })).toBeUndefined();
});
