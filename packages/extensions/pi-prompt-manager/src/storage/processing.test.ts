import { setImmediate } from "node:timers/promises";

import { expect, it } from "vite-plus/test";

import { entry, recordedAt } from "../test-fixture.ts";
import { readCollectionAsync, updateCollectionAsync } from "./processing.ts";

const options = { collection: "drafts", cwd: "/fixture", retention: 250 } as const;
const raw = () =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      cwd: options.cwd,
      entries: [entry("exact\ttext", { metadata: "x".repeat(2 * 1024 * 1024) }), entry("keep")],
      ["__proto__"]: { preserved: true },
      extra: { preserved: true }
    })
  );

it("keeps large collection processing off the event loop without detaching borrowed bytes", async () => {
  const bytes = raw();
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);

  try {
    const actual = await readCollectionAsync({ ...options, raw: bytes });
    expect(actual).toMatchObject({
      status: "ready",
      access: "writable",
      entries: [{ source: { text: "exact\ttext" } }, { source: { text: "keep" } }]
    });
    expect(ticks).toBeGreaterThan(0);
    expect(bytes.toString("utf8")).toContain("exact\\ttext");
    const operation = { kind: "delete", target: actual.entries[0]! } as const;
    expect(await updateCollectionAsync({ ...options, raw: bytes, operation })).toMatchObject({
      status: "replace",
      value: { entries: [{ source: { text: "keep" } }] }
    });
  } finally {
    clearInterval(timer);
  }
});

it("cancels active and queued processing, then accepts another operation", async () => {
  const bytes = raw();
  const first = new AbortController();
  const second = new AbortController();
  const pending = readCollectionAsync({ ...options, raw: bytes, signal: first.signal });
  const queued = readCollectionAsync({ ...options, raw: bytes, signal: second.signal });
  const cancelled = Promise.allSettled([
    pending.then(() => "completed"),
    queued.then(() => "completed")
  ]);
  await setImmediate();
  first.abort();
  second.abort();
  expect(await cancelled).toMatchObject([
    { status: "rejected", reason: { name: "AbortError" } },
    { status: "rejected", reason: { name: "AbortError" } }
  ]);
  expect(await readCollectionAsync({ ...options, raw: bytes })).toMatchObject({ status: "ready" });
});

it("rejects malformed input with safe storage diagnostics", async () => {
  const bytes = Buffer.from("private malformed source" + " ".repeat(1024 * 1024));
  await expect(readCollectionAsync({ ...options, raw: bytes })).rejects.toThrow(
    "invalid UTF-8 or JSON"
  );
  await expect(
    updateCollectionAsync({
      ...options,
      raw: bytes,
      operation: { kind: "add", text: "new", recordedAt }
    })
  ).rejects.toThrow("invalid UTF-8 or JSON");
});
