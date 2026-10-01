import { expect, it } from "vite-plus/test";

import type { Document } from "../model.ts";
import {
  collection,
  documentedLimits as limits,
  encode,
  entry,
  recordedAt
} from "../test-fixture.ts";
import { readCollection, updateCollection } from "./collection.ts";

const scope = { collection: "drafts", cwd: "/fixture", retention: 250 } as const;
const add = (text: string) => ({ kind: "add" as const, text, recordedAt });
const rawDocument = (entries: Document["entries"], extra = {}) =>
  Buffer.from(encode({ version: 1, cwd: scope.cwd, entries, ...extra }));

it("refuses corrupt documents without treating them as empty", () => {
  for (const raw of [
    Buffer.from(""),
    Buffer.from("{"),
    Buffer.from([0xff]),
    Buffer.from('{"version":2,"cwd":"/fixture","entries":[]}'),
    Buffer.from('{"version":1,"cwd":"/wrong","entries":[]}'),
    Buffer.from('{"version":1,"cwd":"/fixture","entries":null}')
  ]) {
    expect(() => readCollection("drafts", scope.cwd, raw)).toThrow();
    expect(() => updateCollection({ ...scope, raw, operation: add("new") })).toThrow();
  }

  expect(readCollection("drafts", scope.cwd).entries).toEqual([]);
});

it("keeps parsed numbers that cannot be re-encoded inspectable but read-only", () => {
  const raw = Buffer.from(
    '{"version":1,"cwd":"/fixture","entries":[{"id":"11111111-1111-1111-1111-111111111111","text":"keep","recordedAt":1e400}],"metadata":{"value":1e400}}'
  );
  const current = readCollection("drafts", scope.cwd, raw);

  expect(current).toMatchObject({
    access: "read-only",
    document: { entries: [{ recordedAt: Infinity }], metadata: { value: Infinity } }
  });
  expect(() => updateCollection({ ...scope, raw, operation: add("new") })).toThrow("read-only");
});

it("preserves unknown fields and raw timestamps, ignores unusable text, and refuses read-only mutations", () => {
  const good = entry("keep", { recordedAt: { raw: "invalid" }, custom: [1, 2] });
  const invalid = { text: "inspect", custom: true };
  const raw = rawDocument([good, invalid, entry("  ")], { extra: { retained: true } });
  const read = readCollection("drafts", scope.cwd, raw);
  expect(read.document.entries).toEqual([good, invalid]);
  expect(read.document.extra).toEqual({ retained: true });
  expect(read.access).toBe("read-only");
  expect(read.entries[1]?.identity).toBe("invalid");
  expect(read.warnings.length).toBeGreaterThan(0);
  for (const operation of [add("new"), { kind: "delete" as const, target: read.entries[0]! }])
    expect(() => updateCollection({ ...scope, raw, operation })).toThrow("read-only");
});

it("preserves exact source and prototype-like JSON fields through a complete mutation", () => {
  const raw = Buffer.from(
    '{"version":1,"cwd":"/fixture","__proto__":{"kept":true},"entries":[{"id":"11111111-1111-1111-1111-111111111111","text":"  keep\\n","__proto__":{"raw":true},"constructor":"metadata"}]}'
  );
  const result = updateCollection({ ...scope, raw, operation: add(" \texact\r\n ") });
  expect(result.status).toBe("replace");
  if (result.status !== "replace") throw new Error("Expected replacement");
  expect(result.value.document.entries[1]).toEqual({
    id: "11111111-1111-1111-1111-111111111111",
    text: "  keep\n",
    ["__proto__"]: { raw: true },
    constructor: "metadata"
  });
  expect(result.value.document.__proto__).toEqual({ kept: true });
  expect(Object.hasOwn(result.value.document, "__proto__")).toBe(true);
  expect(Object.hasOwn(result.value.document.entries[1]!, "__proto__")).toBe(true);
  expect(
    readCollection("drafts", scope.cwd, Buffer.from(result.content)).document.entries[0]?.text
  ).toBe(" \texact\r\n ");
});

it("deletes only unique unchanged UUID/text/timestamp identities despite unrelated insertion", () => {
  const first = entry("same");
  const second = entry("same");
  const selected = collection([first, second]).entries[1]!;
  const inserted = entry("other");
  const operation = { kind: "delete" as const, target: selected };
  const result = updateCollection({
    ...scope,
    raw: rawDocument([inserted, first, second]),
    operation
  });
  expect(result.value.document.entries).toEqual([inserted, first]);

  for (const entries of [
    [first],
    [first, { ...second, text: "changed" }],
    [first, { ...second, recordedAt: null }],
    [first, second, { ...second }]
  ])
    expect(() => updateCollection({ ...scope, raw: rawDocument(entries), operation })).toThrow();
  const duplicate = collection([first, { ...first }]);
  expect(duplicate.entries[0]?.identity).toBe("ambiguous");
  expect(() =>
    updateCollection({
      ...scope,
      raw: rawDocument(duplicate.document.entries),
      operation: { kind: "delete", target: duplicate.entries[0]! }
    })
  ).toThrow();
});

it("distinguishes absent timestamps, accepts case-insensitive UUIDs, and preserves recovery metadata", () => {
  const saved = entry("source", { recordedAt: { unrecognized: true }, extra: "keep" });
  const target = collection([saved]).entries[0]!;
  const result = updateCollection({
    ...scope,
    raw: rawDocument([{ ...saved, id: String(saved.id).toUpperCase() }, entry("other")], {
      extra: "keep"
    }),
    operation: { kind: "delete", target }
  });
  expect(result.value.document.extra).toBe("keep");
  expect(result.value.entries.map((item) => item.source.text)).toEqual(["other"]);
  const absent = { id: saved.id, text: "source" };
  expect(() =>
    updateCollection({
      ...scope,
      raw: rawDocument([{ ...absent, recordedAt: null }]),
      operation: { kind: "delete", target: collection([absent]).entries[0]! }
    })
  ).toThrow("changed");
});

it("enforces every hard recovery bound and identifies count/text/file capacity recovery", () => {
  const parse = (entries: ReturnType<typeof entry>[]) =>
    readCollection("drafts", scope.cwd, rawDocument(entries));
  expect(parse(Array.from({ length: 1001 }, () => entry("x"))).access).toBe("delete-only");
  expect(parse([entry("x".repeat(limits.draftText + 1))]).access).toBe("delete-only");
  expect(() => parse(Array.from({ length: 5001 }, () => entry("x")))).toThrow("5,000");
  expect(() => parse([entry("x", { metadata: "x".repeat(limits.recoveryRecord) })])).toThrow(
    "8 MiB"
  );
  expect(() => readCollection("drafts", scope.cwd, Buffer.alloc(limits.read + 1))).toThrow(
    "64 MiB"
  );
  const overFile = Buffer.concat([rawDocument([entry("x")]), Buffer.alloc(limits.draftFile, " ")]);
  expect(readCollection("drafts", scope.cwd, overFile).access).toBe("delete-only");
  expect(() => updateCollection({ ...scope, raw: overFile, operation: add("new") })).toThrow(
    "recovery"
  );
});

it("rejects history with more records than the recovery count", () => {
  const records = Array.from({ length: limits.recoveryCount + 1 }, (_, index) =>
    entry(`entry ${index}`)
  );
  const raw = rawDocument(records);
  expect(readCollection("history", scope.cwd, rawDocument(records.slice(1))).entries).toHaveLength(
    limits.recoveryCount
  );
  expect(() => readCollection("history", scope.cwd, raw)).toThrow("recovery");
});

it("counts ignored records for recovery and allows only deletions that shrink original bytes", () => {
  const kept = entry("keep", { recordedAt: { invalid: true }, extra: "retained" });
  const removed = entry("remove");
  const raw = rawDocument([kept, removed, ...Array.from({ length: 999 }, () => entry(" "))], {
    extra: "metadata"
  });
  const current = readCollection("drafts", scope.cwd, raw);
  expect(current.access).toBe("delete-only");
  expect(current.entries).toHaveLength(2);
  expect(() => updateCollection({ ...scope, raw, operation: add("new") })).toThrow("recovery");
  const result = updateCollection({
    ...scope,
    raw,
    operation: { kind: "delete", target: current.entries[1]! }
  });
  expect(result.value.document).toEqual({
    version: 1,
    cwd: scope.cwd,
    entries: [kept],
    extra: "metadata"
  });
  expect(result.value.access).toBe("writable");
  expect(result.value.bytes).toBeLessThan(raw.length);

  const compact = Buffer.from(
    JSON.stringify({
      version: 1,
      cwd: scope.cwd,
      entries: [
        entry("x".repeat(limits.draftText + 1)),
        ...Array.from({ length: 30 }, () => entry("x"))
      ]
    })
  );
  const target = readCollection("drafts", scope.cwd, compact).entries[1]!;
  expect(() =>
    updateCollection({ ...scope, raw: compact, operation: { kind: "delete", target } })
  ).toThrow("would not reduce");
});

it("never evicts drafts and counts UTF-8 text and final JSON escaping toward capacity", () => {
  const raw = rawDocument(Array.from({ length: limits.draftCount }, () => entry("kept")));
  expect(() => updateCollection({ ...scope, raw, operation: add("new") })).toThrow("capacity");
  expect(() =>
    updateCollection({
      ...scope,
      raw: undefined,
      operation: add("é".repeat(limits.draftText / 2 + 1))
    })
  ).toThrow("256 KiB");
  expect(() => updateCollection({ ...scope, raw: undefined, operation: add(" \n ") })).toThrow(
    "blank"
  );
  const almostFull = rawDocument([entry("kept")], { extra: "x".repeat(limits.draftFile - 500) });
  expect(readCollection("drafts", scope.cwd, almostFull).access).toBe("writable");
  expect(() =>
    updateCollection({ ...scope, raw: almostFull, operation: add("x" + "\n".repeat(400)) })
  ).toThrow("capacity");
});

it("fits exact pretty-printed history sizes including nested metadata and escaping", () => {
  const incoming = 'new\n\t"é';
  const records = [
    entry("keep", { metadata: { nested: ["é", "line\nline", { value: true }] } }),
    entry("old")
  ];
  // A UUID has a fixed width; calculate the committed JSON size from the documented format,
  // not from a previous updateCollection result.
  const expectedDocument = {
    version: 1,
    cwd: scope.cwd,
    entries: [
      { id: "11111111-1111-1111-1111-111111111111", text: incoming, recordedAt },
      records[0]
    ],
    extra: ""
  };
  const padding = "x".repeat(
    limits.historyFile - Buffer.byteLength(JSON.stringify(expectedDocument, null, 2) + "\n")
  );
  const raw = rawDocument(records, { extra: padding });
  const result = updateCollection({
    ...scope,
    collection: "history",
    raw,
    operation: add(incoming)
  });
  if (result.status !== "replace") throw new Error("Expected replacement");
  expect(Buffer.byteLength(result.content)).toBe(limits.historyFile);
  expect(result.value.entries.map((item) => item.source.text)).toEqual([incoming, "keep"]);
  const smaller = updateCollection({
    ...scope,
    collection: "history",
    raw: rawDocument(records, { extra: padding + "x" }),
    operation: add(incoming)
  });
  expect(smaller.value.entries.map((item) => item.source.text)).toEqual([incoming]);
});

it("retains history prefixes, suppresses only consecutive equality, and does not prune suppressed captures", () => {
  let raw: Buffer | undefined;

  for (const text of ["A", "B", "A", " A "]) {
    const result = updateCollection({ ...scope, collection: "history", raw, operation: add(text) });
    if (result.status === "replace") raw = Buffer.from(result.content);
  }

  const current = readCollection("history", scope.cwd, raw);
  expect(current.entries.map((item) => item.source.text)).toEqual(["A", "B", "A"]);

  for (const text of [" A ", " \n\t ", "é".repeat(limits.historyText / 2 + 1)]) {
    const result = updateCollection({
      ...scope,
      collection: "history",
      raw,
      operation: add(text),
      retention: 1
    });
    expect(result.status).toBe("unchanged");
    expect(result.value.entries.map((item) => item.source.text)).toEqual(["A", "B", "A"]);
  }

  const result = updateCollection({
    ...scope,
    collection: "history",
    raw,
    operation: add("a"),
    retention: 2
  });
  expect(result.value.entries.map((item) => item.source.text)).toEqual(["a", "A"]);
  const large = updateCollection({
    ...scope,
    collection: "history",
    raw: rawDocument([
      entry("newer", { metadata: "x".repeat(limits.historyFile) }),
      entry("older")
    ]),
    operation: add(" \nincoming\t ")
  });
  expect(large.value.entries.map((item) => item.source.text)).toEqual(["incoming"]);
  expect(large.value.bytes).toBeLessThan(limits.historyFile);
});
