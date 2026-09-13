import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import {
  METADATA_TYPE,
  parseDisplayRecord,
  persistDisplayFact,
  readDisplayRecords
} from "./session-metadata.ts";
import { assistantMessage, toolCall } from "./test-fixture.ts";

it("persists extra facts outside model context and associates ancestry across branches and forks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-metadata-"));

  try {
    const session = SessionManager.create(directory, directory);
    session.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
    const entry = session.appendMessage(
      assistantMessage([toolCall("write-1", "write", { path: "a", content: "new" })])
    );
    const reference = {
      messageEntryId: entry,
      messageTimestamp: 1,
      contentIndex: 0,
      toolCallId: "write-1"
    };
    const context = structuredClone(session.buildSessionContext());

    const append = (type: string, data: unknown) => {
      session.appendCustomEntry(type, data);
    };

    persistDisplayFact(append, reference, "pi:write", {
      kind: "change",
      availability: "available",
      patch: "--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n",
      change: "modification"
    });
    const metadataLeaf = session.getLeafId()!;
    expect(session.buildSessionContext()).toEqual(context);
    expect(readDisplayRecords(session.getBranch())).toHaveLength(1);
    const file = session.getSessionFile()!;
    const reopened = SessionManager.open(file);
    expect(readDisplayRecords(reopened.getBranch())).toHaveLength(1);
    const fork = SessionManager.forkFrom(file, directory, join(directory, "fork"));
    expect(readDisplayRecords(fork.getBranch())).toHaveLength(1);
    session.branch(entry);
    expect(readDisplayRecords(session.getBranch())).toEqual([]);
    session.branch(metadataLeaf);
    session.appendCompaction("summary", entry, 100);
    expect(readDisplayRecords(session.getBranch())).toHaveLength(1);
    session.appendCustomEntry(METADATA_TYPE, { version: 2 });
    session.appendCustomEntry(METADATA_TYPE, {
      version: 1,
      call: reference,
      adapter: "pi:write",
      fact: { kind: "operation", availability: "available", durationMs: "bad" }
    });
    expect(readDisplayRecords(session.getBranch())).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it.each([
  { kind: "operation", availability: "available", durationMs: 1, outcome: ["success"] },
  { kind: "change", availability: ["available"] },
  { kind: "change", availability: ["unavailable"] }
])("rejects persisted facts with non-string enum values: %j", (fact) => {
  expect(
    parseDisplayRecord({
      version: 1,
      call: { messageTimestamp: 1, contentIndex: 0, toolCallId: "a" },
      adapter: "pi:write",
      fact
    })
  ).toBeUndefined();
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
