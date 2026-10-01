import { fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import type { DisplayFact } from "../contracts.ts";
import { assistantMessage } from "../test-fixture.ts";
import {
  METADATA_TYPE,
  DisplayRecordIndex,
  parseDisplayRecord,
  persistDisplayFact
} from "./metadata.ts";

it("persists typed facts and reads only matching source calls from the supplied ancestry", () => {
  const source = {
    type: "message",
    id: "source",
    parentId: null,
    timestamp: new Date(0).toISOString(),
    message: assistantMessage([
      fauxToolCall("write", { path: "a", content: "new" }, { id: "write-1" })
    ])
  } satisfies SessionEntry;
  const reference = {
    messageEntryId: source.id,
    messageTimestamp: 1,
    contentIndex: 0,
    toolCallId: "write-1"
  };
  const fact = {
    kind: "change",
    availability: "available",
    patch: "--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n",
    change: "modification"
  } satisfies DisplayFact;
  const append = vi.fn<ExtensionAPI["appendEntry"]>();
  persistDisplayFact(append, reference, "pi:write", fact);
  const record = { version: 1, call: reference, adapter: "pi:write", fact };
  expect(append).toHaveBeenCalledExactlyOnceWith("pi-tool-display.facts", record);
  const metadata = {
    type: "custom",
    id: "facts",
    parentId: source.id,
    timestamp: source.timestamp,
    customType: METADATA_TYPE,
    data: append.mock.calls[0]![1]
  } satisfies SessionEntry;
  expect(new DisplayRecordIndex([source, metadata]).forCall(reference)).toEqual([record]);
  expect(new DisplayRecordIndex([source]).forCall(reference)).toEqual([]);
  expect(new DisplayRecordIndex([metadata]).forCall(reference)).toEqual([]);

  for (const mismatch of [
    { ...source, id: "other-branch" },
    { ...source, message: { ...source.message, timestamp: 2 } },
    { ...source, message: assistantMessage([fauxToolCall("write", {}, { id: "other-call" })]) },
    { ...source, message: assistantMessage([{ type: "text", text: "no tool call" }]) }
  ])
    expect(new DisplayRecordIndex([mismatch, metadata]).forCall(reference)).toEqual([]);

  expect(
    new DisplayRecordIndex([
      source,
      metadata,
      { ...metadata, data: { ...record, version: 2 } },
      { ...metadata, customType: "other-extension", data: { ...record, adapter: "other" } }
    ]).forCall(reference)
  ).toEqual([record]);
});
it("indexes source entries once and keeps the latest fact per adapter, call, and kind", () => {
  const entries: SessionEntry[] = [];
  const timestamp = new Date(0).toISOString();

  for (let index = 0; index < 100; index++) {
    const id = String(index);
    entries.push({
      type: "message",
      id,
      parentId: null,
      timestamp,
      message: assistantMessage([fauxToolCall("bash", {}, { id })], index)
    });
    const call = {
      messageEntryId: id,
      messageTimestamp: index,
      contentIndex: 0,
      toolCallId: id
    };
    for (const durationMs of [1, 2])
      entries.push({
        type: "custom",
        id: `fact-${id}-${durationMs}`,
        parentId: id,
        timestamp,
        customType: METADATA_TYPE,
        data: {
          version: 1,
          call,
          adapter: "pi:bash",
          fact: { kind: "operation", availability: "available", outcome: "success", durationMs }
        }
      });
  }

  let accesses = 0;
  const branch = entries.map((entry) => ({
    ...entry,
    get id() {
      accesses++;

      return entry.id;
    }
  }));
  const records = new DisplayRecordIndex(branch);

  for (let index = 0; index < 100; index++) {
    const reference = { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) };
    const facts = records.forCall(reference);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.fact).toMatchObject({ durationMs: 2 });
  }

  expect(accesses).toBeLessThanOrEqual(branch.length);
});

it.each([
  { kind: "operation", availability: "available", durationMs: 1, outcome: ["success"] },
  { kind: "change", availability: ["available"] },
  { kind: "change", availability: "available" },
  { kind: "change", availability: "unavailable", reason: "x".repeat(257) },
  { kind: "operation", availability: "available", outcome: "success", durationMs: -1 },
  { kind: "operation", availability: "available", outcome: "success", durationMs: Infinity },
  {
    kind: "operation",
    availability: "available",
    outcome: "success",
    durationMs: 1,
    exitCode: 1.5
  },
  {
    kind: "operation",
    availability: "available",
    outcome: "success",
    durationMs: 1,
    timedOut: "false"
  },
  { kind: "saved-output", availability: "available", path: "" }
])("rejects persisted facts with invalid fields: %j", (fact) => {
  expect(
    parseDisplayRecord({
      version: 1,
      call: { messageTimestamp: 1, contentIndex: 0, toolCallId: "a" },
      adapter: "pi:write",
      fact
    })
  ).toBeUndefined();
});

it("bounds the original record, including unknown fields, and rejects unsafe call references", () => {
  const record = {
    version: 1,
    call: { messageTimestamp: 1, contentIndex: 0, toolCallId: "a" },
    adapter: "pi:bash",
    fact: {
      kind: "operation",
      availability: "available",
      outcome: "success",
      durationMs: 0,
      exitCode: null
    }
  };
  expect(parseDisplayRecord(record)).toEqual(record);
  expect(parseDisplayRecord({ ...record, extra: "x".repeat(160 * 1024) })).toBeUndefined();
  expect(
    parseDisplayRecord({
      ...record,
      extra: record,
      cycle: {
        get self() {
          return this;
        }
      }
    })
  ).toBeUndefined();
  for (const call of [
    { ...record.call, contentIndex: Number.MAX_SAFE_INTEGER + 1 },
    { ...record.call, contentIndex: -1 },
    { ...record.call, messageTimestamp: NaN },
    { ...record.call, messageTimestamp: "1" },
    { ...record.call, messageEntryId: null }
  ])
    expect(parseDisplayRecord({ ...record, call })).toBeUndefined();
});

it("ignores malformed and oversized records and isolates serialization/persistence failures", () => {
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "a" };
  expect(
    parseDisplayRecord({
      version: 1,
      call: reference,
      adapter: "pi:write",
      fact: { kind: "change", availability: "available", patch: "x".repeat(200_000) }
    })
  ).toBeUndefined();
  expect(() =>
    persistDisplayFact(
      () => {
        throw new Error("disk failure");
      },
      reference,
      "pi:bash",
      {
        kind: "operation",
        availability: "available",
        durationMs: 12,
        outcome: "failure",
        exitCode: 7
      }
    )
  ).not.toThrow();
});
