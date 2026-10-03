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

it("distinguishes absent timestamps and accepts case-insensitive UUIDs", () => {
  const saved = entry("source", { recordedAt: { unrecognized: true } });
  const target = collection([saved]).entries[0]!;
  const result = updateCollection({
    ...scope,
    raw: rawDocument([{ ...saved, id: String(saved.id).toUpperCase() }, entry("other")]),
    operation: { kind: "delete", target }
  });
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

it("never evicts drafts when count, UTF-8 text, or final JSON escaping exceed capacity", () => {
  const raw = rawDocument(Array.from({ length: limits.draftCount }, () => entry("kept")));
  expect(() => updateCollection({ ...scope, raw, operation: add("new") })).toThrow("capacity");
  expect(() =>
    updateCollection({
      ...scope,
      raw: undefined,
      operation: add("é".repeat(limits.draftText / 2 + 1))
    })
  ).toThrow("256 KiB");
  const almostFull = rawDocument([entry("kept")], { extra: "x".repeat(limits.draftFile - 500) });
  expect(readCollection("drafts", scope.cwd, almostFull).access).toBe("writable");
  expect(() =>
    updateCollection({ ...scope, raw: almostFull, operation: add("x" + "\n".repeat(400)) })
  ).toThrow("capacity");
});
