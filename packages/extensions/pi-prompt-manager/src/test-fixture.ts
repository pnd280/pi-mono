import { randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WriteScope } from "@pi-mono/libs/private-files";

import { PromptManager, type ManagerPorts } from "./manager.ts";
import type { Collection, Document, Snapshot, StoredEntry } from "./model.ts";
import { readCollection } from "./storage/collection.ts";
import { FileRepository } from "./storage/repository.ts";

export const recordedAt = "2026-01-01T12:00:00.000Z";

export function entry(text: string, extra: Record<string, unknown> = {}): StoredEntry {
  return { id: randomUUID(), text, recordedAt, ...extra };
}

export function encode(document: Document): string {
  return JSON.stringify(document, null, 2) + "\n";
}

export function collection(entries: StoredEntry[] = [], kind: Collection = "drafts"): Snapshot {
  return readCollection(
    kind,
    "/fixture",
    Buffer.from(encode({ version: 1, cwd: "/fixture", entries }))
  );
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

export function session(): WriteScope {
  return { signal: new AbortController().signal, atomic: (write) => write() };
}

export async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "pi-prompts-test-"));
  const cwd = join(directory, "project");
  const agentDir = join(directory, "agent");
  await Promise.all([mkdir(cwd), mkdir(agentDir)]);
  const realCwd = await realpath(cwd);
  const repository = await FileRepository.create({ cwd, agentDir, retention: 250 });
  const storage = join(
    agentDir,
    "pi-prompt-manager",
    createHash("sha256").update(realCwd).digest("hex")
  );
  await repository.read("drafts");

  return { directory, cwd, realCwd, agentDir, storage, repository };
}

export function managerFixture(overrides: Partial<ManagerPorts> = {}) {
  let text = "draft";
  const notices: string[] = [];
  const ports: ManagerPorts = {
    repository: {
      read: async () => collection(),
      mutate: async () => ({ status: "committed", snapshot: collection(), warnings: [] })
    },
    editor: {
      read: () => text,
      write: (next) => {
        text = next;
      }
    },
    copy: async () => {},
    notify: (message) => {
      notices.push(message);
    },
    open: async () => {},
    now: () => new Date(recordedAt),
    ...overrides
  };
  const manager = new PromptManager(ports);

  return {
    manager,
    ports,
    notices,
    getText: () => text,
    setText: (next: string) => {
      text = next;
    }
  };
}
