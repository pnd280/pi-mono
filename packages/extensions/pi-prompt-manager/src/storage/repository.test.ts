import { fork } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  truncate,
  utimes,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import type { Snapshot } from "../model.ts";
import {
  documentedLimits as limits,
  encode,
  entry,
  managerFixture,
  recordedAt,
  session,
  workspace
} from "../test-fixture.ts";
import { FileRepository } from "./repository.ts";

let fixture: Awaited<ReturnType<typeof workspace>>;
beforeEach(async () => {
  fixture = await workspace();
});
afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true });
});
const add = (text: string) => ({ kind: "add" as const, text, recordedAt });

async function drafts(): Promise<Snapshot> {
  const result = await fixture.repository.read("drafts");

  if (result.status !== "ready") throw new Error(result.message);

  return result;
}

it("uses the latest persisted document across repository instances and realpath aliases", async () => {
  const alias = join(fixture.directory, "alias");
  await symlink(fixture.cwd, alias);
  const other = await FileRepository.create({
    cwd: alias,
    agentDir: fixture.agentDir,
    retention: 250
  });
  await fixture.repository.mutate("history", add("A"), session());
  await other.mutate("history", add("B"), session());
  await fixture.repository.mutate("history", add("A"), session());
  expect((await other.mutate("history", add(" A "), session())).status).toBe("unchanged");
  const history = await other.read("history");
  expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual([
    "A",
    "B",
    "A"
  ]);
  const distinct = join(fixture.directory, "distinct");
  await mkdir(distinct);
  const isolated = await FileRepository.create({
    cwd: distinct,
    agentDir: fixture.agentDir,
    retention: 1
  });
  expect((await isolated.read("history")).status).toBe("ready");
  expect(await isolated.read("history")).toMatchObject({ entries: [] });
  await expect(
    FileRepository.create({
      cwd: join(fixture.directory, "missing"),
      agentDir: fixture.agentDir,
      retention: 1
    })
  ).rejects.toThrow("real path");
});

it("does not prune on opening and commits repeated exact drafts with different UUIDs", async () => {
  await fixture.repository.mutate("history", add("first"), session());
  await fixture.repository.mutate("history", add("second"), session());
  const lower = await FileRepository.create({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    retention: 1
  });
  expect(await lower.read("history")).toMatchObject({
    entries: [{ source: { text: "second" } }, { source: { text: "first" } }]
  });
  await lower.mutate("history", add("third"), session());
  expect(await lower.read("history")).toMatchObject({ entries: [{ source: { text: "third" } }] });
  await Promise.all([
    fixture.repository.mutate("drafts", add(" \ttext\r\n "), session()),
    fixture.repository.mutate("drafts", add(" \ttext\r\n "), session())
  ]);
  const current = await drafts();
  expect(current.entries.map((item) => item.source.text)).toEqual([" \ttext\r\n ", " \ttext\r\n "]);
  expect(current.entries[0]?.source.id).not.toBe(current.entries[1]?.source.id);
});

it("repairs owned permissions even when capacity rejects the save, without changing stored bytes", async () => {
  const path = join(fixture.storage, "drafts.json");
  await fixture.repository.mutate("drafts", add("saved"), session());
  const before = await readFile(path);
  await chmod(path, 0o666);
  await chmod(fixture.storage, 0o777);
  const result = await fixture.repository.mutate(
    "drafts",
    add("x".repeat(limits.draftText + 1)),
    session()
  );
  expect(result.status).toBe("failed");
  expect(await readFile(path)).toEqual(before);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect((await stat(fixture.storage)).mode & 0o777).toBe(0o700);
  expect((await stat(join(fixture.agentDir, "pi-prompt-manager"))).mode & 0o777).toBe(0o700);
});

it("applies private-file and private-directory refusal independently to collections", async () => {
  const path = join(fixture.storage, "drafts.json");
  const source = join(fixture.directory, "unrelated");
  await writeFile(source, "not ours", { mode: 0o644 });
  await symlink(source, path);
  expect((await fixture.repository.read("drafts")).status).toBe("unavailable");
  expect((await fixture.repository.read("history")).status).toBe("ready");
  expect(await readFile(source, "utf8")).toBe("not ours");
  expect((await stat(source)).mode & 0o777).toBe(0o644);
  await rm(fixture.storage, { recursive: true });
  await symlink(fixture.cwd, fixture.storage);
  expect((await fixture.repository.read("history")).status).toBe("unavailable");
});

it("bounds file reads before parsing and never overwrites corruption", async () => {
  const path = join(fixture.storage, "drafts.json");
  await writeFile(path, Buffer.from([0xff]));
  expect((await fixture.repository.mutate("drafts", add("new"), session())).status).toBe("failed");
  expect(await readFile(path)).toEqual(Buffer.from([0xff]));
  await truncate(path, limits.read + 1);
  const result = await fixture.repository.read("drafts");
  expect(result.status).toBe("unavailable");
  expect(result.status === "unavailable" && result.message).toContain("64 MiB");
});

it("rejects additions to recovery based on original bytes, permits strictly reducing identity deletion", async () => {
  const path = join(fixture.storage, "drafts.json");
  const first = entry("first", { recordedAt: { unrecognized: true }, extra: "keep" });
  const second = entry("second");
  const document = {
    version: 1 as const,
    cwd: fixture.realCwd,
    entries: [first, second],
    extra: "metadata"
  };
  const raw = encode(document) + " ".repeat(limits.draftFile);
  await writeFile(path, raw);
  expect((await drafts()).access).toBe("delete-only");
  expect((await fixture.repository.mutate("drafts", add("no"), session())).status).toBe("failed");
  expect(await readFile(path, "utf8")).toBe(raw);
  const result = await fixture.repository.mutate(
    "drafts",
    { kind: "delete", target: (await drafts()).entries[1]! },
    session()
  );
  expect(result.status).toBe("committed");
  expect((await drafts()).document).toEqual({ ...document, entries: [first] });
  const largeEntries = Array.from({ length: 1002 }, () => entry("x"));
  await writeFile(path, encode({ ...document, entries: largeEntries }));
  expect(
    (
      await fixture.repository.mutate(
        "drafts",
        { kind: "delete", target: (await drafts()).entries[0]! },
        session()
      )
    ).status
  ).toBe("committed");
  expect((await drafts()).access).toBe("delete-only");
});

it("preserves old snapshots before rename and reports post-commit cleanup separately", async () => {
  await fixture.repository.mutate("drafts", add("original"), session());
  const failing = await FileRepository.create({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    retention: 250,
    hooks: {
      beforeRename: async () => {
        throw new Error("fault");
      }
    }
  });
  expect((await failing.mutate("drafts", add("failed"), session())).status).toBe("failed");
  expect((await drafts()).entries.map((item) => item.source.text)).toEqual(["original"]);
  const cleanupFault = await FileRepository.create({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    retention: 250,
    hooks: {
      afterRename: async () => {
        throw new Error("fault");
      }
    }
  });
  const result = await cleanupFault.mutate("drafts", add("committed"), session());
  expect(result).toMatchObject({
    status: "committed",
    warnings: [expect.stringContaining("committed")]
  });
  expect((await drafts()).entries[0]?.source.text).toBe("committed");
  expect((await readdir(fixture.storage)).filter((name) => /\.(tmp|lock)$/.test(name))).toEqual([]);
});

it("expires queued work but lets started atomic writes and owned lock cleanup finish", async () => {
  const started = Promise.withResolvers<void>();
  const proceed = Promise.withResolvers<void>();
  const repository = await FileRepository.create({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    retention: 250,
    hooks: {
      beforeRename: async () => {
        started.resolve();
        await proceed.promise;
      }
    }
  });
  const { manager, notices } = managerFixture({ repository });
  manager.capture("first");
  manager.capture("discarded");
  await started.promise;
  const finishing = manager.dispose();
  expect(await fixture.repository.read("history")).toMatchObject({ entries: [] });
  proceed.resolve();
  await finishing;
  expect(await fixture.repository.read("history")).toMatchObject({
    entries: [{ source: { text: "first" } }]
  });
  expect(notices).toEqual([]);
  expect((await readdir(fixture.storage)).some((name) => name.endsWith(".lock"))).toBe(false);
});

function worker(label: string, count: number) {
  const child = fork(
    new URL("../../validation/storage-worker.ts", import.meta.url),
    [fixture.cwd, fixture.agentDir, label, String(count)],
    {
      execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"],
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    }
  );
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const completion = once(child, "close").then(([code, signal]: unknown[]) => ({
    code,
    signal,
    stderr
  }));

  return { child, completion };
}

it("preserves unrelated mutations from two real processes", async () => {
  const left = worker("left", 12);
  const right = worker("right", 12);

  try {
    const exits = await Promise.all([left.completion, right.completion]);
    expect(
      exits.map(({ code }) => code),
      JSON.stringify(exits, null, 2)
    ).toEqual([0, 0]);
    expect((await drafts()).entries.map((item) => item.source.text).sort()).toEqual(
      [
        ...Array.from({ length: 12 }, (_, index) => `left-${index}`),
        ...Array.from({ length: 12 }, (_, index) => `right-${index}`)
      ].sort()
    );
  } finally {
    left.child.kill();
    right.child.kill();
  }
}, 15000);

it("reports the collection deadline without reclaiming abandoned locks", async () => {
  const lock = join(fixture.storage, "drafts.json.lock");
  await writeFile(lock, "abandoned-token", { mode: 0o600 });
  await utimes(lock, new Date(0), new Date(0));
  const result = await fixture.repository.mutate("drafts", add("must not commit"), session());
  expect(result.status).toBe("failed");
  expect(result.status === "failed" && result.message).toContain("two-second");
  expect(await readFile(lock, "utf8")).toBe("abandoned-token");
}, 15000);
