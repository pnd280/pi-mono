import { randomUUID, createHash } from "node:crypto";
import type * as fs from "node:fs/promises";
import { mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { vi } from "vite-plus/test";

import { PromptManager, type ManagerPorts } from "./manager.ts";
import type { Collection, Document, Snapshot, StoredEntry } from "./model.ts";
import type { WriteScope } from "./private-files/index.ts";
import { readCollection } from "./storage/collection.ts";
import { FileRepository } from "./storage/repository.ts";

export const recordedAt = "2026-01-01T12:00:00.000Z";

/** Fixed boundaries from docs/storage.md, independent of the production limit declarations. */
export const documentedLimits = {
  draftText: 256 * 1024,
  draftCount: 1000,
  draftFile: 16 * 1024 * 1024,
  read: 64 * 1024 * 1024
} as const;

/** Make the next atomic write's descriptor close fail after the descriptor closes, which is after its rename commits. The calling test file must declare `vi.mock("node:fs/promises", { spy: true })`. */
export async function failTemporaryClose(): Promise<void> {
  const { open: realOpen } = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(open).mockImplementation(async (...args) => {
    const handle = await realOpen(...args);
    if (!String(args[0]).endsWith(".tmp")) return handle;
    vi.mocked(open).mockImplementation(realOpen);
    const close = handle.close.bind(handle);

    handle.close = async () => {
      await close();
      throw new Error("close fault");
    };

    return handle;
  });
}

export function entry(text: string, extra: Record<string, unknown> = {}): StoredEntry {
  return { id: randomUUID(), text, recordedAt, ...extra };
}

export function encode(document: Document): string {
  return JSON.stringify(document, null, 2) + "\n";
}

export function collection(entries: StoredEntry[] = [], kind: Collection = "drafts"): Snapshot {
  return readCollection({
    collection: kind,
    cwd: "/fixture",
    raw: Buffer.from(encode({ version: 1, cwd: "/fixture", entries }))
  });
}

export function session(): WriteScope {
  return { signal: new AbortController().signal, atomic: (write) => write() };
}

export async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "pi-prompts-test-"));
  let ready = false;

  try {
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
    ready = true;

    return { directory, cwd, realCwd, agentDir, storage, repository };
  } finally {
    if (!ready) await rm(directory, { recursive: true, force: true });
  }
}

export function managerFixture(overrides: Partial<ManagerPorts> = {}) {
  let text = "draft";
  const notices: string[] = [];
  const manager = new PromptManager({
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
  });

  return { manager, notices };
}
