import { Worker } from "node:worker_threads";

import { expect, it, vi } from "vite-plus/test";

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

// JSON.parse keeps this retained number as Infinity under an own `__proto__` key.
const nonFinite = (padding: number) =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      cwd: options.cwd,
      entries: [entry("kept", { ["__proto__"]: { number: 0 }, metadata: "x".repeat(padding) })]
    }).replace('"number":0', '"number":1e400')
  );

it("processes collections without detaching borrowed bytes or rewriting retained data", async () => {
  const bytes = raw();
  const actual = await readCollectionAsync({ ...options, raw: bytes });
  expect(actual).toMatchObject({
    status: "ready",
    access: "writable",
    entries: [{ source: { text: "exact\ttext" } }, { source: { text: "keep" } }]
  });
  expect(bytes.toString("utf8")).toContain("exact\\ttext");
  const operation = { kind: "delete", target: actual.entries[0]! } as const;
  expect(await updateCollectionAsync({ ...options, raw: bytes, operation })).toMatchObject({
    status: "replace",
    value: { entries: [{ source: { text: "keep" } }] }
  });

  // In process and through the worker, a write would turn the retained number into null.
  for (const padding of [0, 2 * 1024 * 1024]) {
    const retained = nonFinite(padding);
    expect(await readCollectionAsync({ ...options, raw: retained })).toMatchObject({
      access: "read-only"
    });
    await expect(
      updateCollectionAsync({
        ...options,
        raw: retained,
        operation: { kind: "add", text: "new", recordedAt }
      })
    ).rejects.toThrow("read-only");
  }
});

it("cancels active and queued processing, then accepts another operation", async () => {
  const bytes = raw();
  const first = new AbortController();
  const second = new AbortController();
  // The spy calls the real method with the worker as its receiver.
  // oxlint-disable-next-line typescript/unbound-method
  const post = Worker.prototype.postMessage;
  const posted = vi.spyOn(Worker.prototype, "postMessage").mockImplementationOnce(function (
    this: Worker,
    ...request
  ) {
    post.apply(this, request);
    // The first request is active, and its reply cannot arrive before this turn ends.
    first.abort();
    second.abort();
  });
  const pending = readCollectionAsync({ ...options, raw: bytes, signal: first.signal });
  const queued = readCollectionAsync({ ...options, raw: bytes, signal: second.signal });
  const cancelled = Promise.allSettled([
    pending.then(() => "completed"),
    queued.then(() => "completed")
  ]);
  expect(await cancelled).toMatchObject([
    { status: "rejected", reason: { name: "AbortError" } },
    { status: "rejected", reason: { name: "AbortError" } }
  ]);
  posted.mockRestore();
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
