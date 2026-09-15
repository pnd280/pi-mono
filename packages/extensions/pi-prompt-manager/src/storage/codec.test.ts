import { expect, it } from "vite-plus/test";

import { limits } from "../model.ts";
import { collection, entry } from "../test-fixture.ts";
import { deleteTarget, encode, parseDocument } from "./codec.ts";

it("refuses corrupt documents without treating them as empty", () => {
  for (const raw of [
    Buffer.from(""),
    Buffer.from("{"),
    Buffer.from([0xff]),
    Buffer.from('{"version":2,"cwd":"/fixture","entries":[]}'),
    Buffer.from('{"version":1,"cwd":"/wrong","entries":[]}'),
    Buffer.from('{"version":1,"cwd":"/fixture","entries":null}')
  ])
    expect(() => parseDocument("drafts", "/fixture", raw)).toThrow();
  expect(parseDocument("drafts", "/fixture").entries).toEqual([]);
});

it("preserves unknown fields and raw invalid/missing timestamps, marks identity problems explicitly", () => {
  const good = entry("keep", { recordedAt: { raw: "invalid" }, custom: [1, 2] });
  const invalid = { text: "inspect", custom: true };
  const document = {
    ...collection([good, invalid, entry("  ")]).document,
    extra: { retained: true }
  };
  const read = parseDocument("drafts", "/fixture", Buffer.from(encode(document)));
  expect(read.document.entries).toEqual([good, invalid]);
  expect(read.document.extra).toEqual({ retained: true });
  expect(read.access).toBe("read-only");
  expect(read.entries[1]?.identity).toBe("invalid");
  expect(read.warnings.length).toBeGreaterThan(0);
});

it("deletes only unique unchanged UUID/text/timestamp identities despite unrelated insertion", () => {
  const first = entry("same");
  const second = entry("same");
  const selected = collection([first, second]).entries[1]!;
  const inserted = entry("other");
  expect(deleteTarget(collection([inserted, first, second]), selected)).toEqual([inserted, first]);

  for (const entries of [
    [first],
    [first, { ...second, text: "changed" }],
    [first, { ...second, recordedAt: null }],
    [first, second, { ...second }]
  ])
    expect(() => deleteTarget(collection(entries), selected)).toThrow();
  const duplicate = collection([first, { ...first }]);
  expect(duplicate.entries[0]?.identity).toBe("ambiguous");
  expect(() => deleteTarget(duplicate, duplicate.entries[0]!)).toThrow();
});

it("enforces every hard recovery bound and identifies count/text/file capacity recovery", () => {
  const parse = (entries: ReturnType<typeof entry>[]) =>
    parseDocument("drafts", "/fixture", Buffer.from(encode(collection(entries).document)));
  expect(parse(Array.from({ length: 1001 }, () => entry("x"))).access).toBe("delete-only");
  expect(parse([entry("x".repeat(limits.draftText + 1))]).access).toBe("delete-only");
  expect(() => parse(Array.from({ length: 5001 }, () => entry("x")))).toThrow("5,000");
  expect(() => parse([entry("x", { metadata: "x".repeat(limits.recoveryRecord) })])).toThrow(
    "8 MiB"
  );
  expect(() => parseDocument("drafts", "/fixture", Buffer.alloc(limits.read + 1))).toThrow(
    "64 MiB"
  );
  const overFile = Buffer.from(
    encode(collection([entry("x")]).document) + " ".repeat(limits.draftFile)
  );
  expect(parseDocument("drafts", "/fixture", overFile).access).toBe("delete-only");
});
