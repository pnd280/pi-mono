export type Collection = "history" | "drafts";

/** Parsed JSON, including unknown fields, is retained rather than reconstructed. */
export type StoredEntry = { text: string; [key: string]: unknown };

export type Document = {
  version: 1;
  cwd: string;
  entries: StoredEntry[];
  [key: string]: unknown;
};

export type Occurrence = {
  source: StoredEntry;
  identity: "valid" | "invalid" | "ambiguous";
  /** Stable within this snapshot even for missing or duplicated IDs. */
  key: string;
  number: number;
};

export type Snapshot = {
  status: "ready";
  collection: Collection;
  document: Document;
  entries: Occurrence[];
  bytes: number;
  access: "writable" | "delete-only" | "read-only";
  warnings: string[];
};

export type ReadResult = Snapshot | { status: "unavailable"; message: string };

export type Mutation =
  | { kind: "add"; text: string; recordedAt: string }
  | { kind: "delete"; target: Occurrence };

export type MutationResult =
  | { status: "committed"; snapshot: Snapshot; warnings: string[] }
  | { status: "unchanged"; snapshot: Snapshot }
  | { status: "failed"; message: string };

export type MutationSession = {
  signal: AbortSignal;
  /** Called synchronously at the final session check, before starting file creation. */
  atomic<T>(write: () => Promise<T>): Promise<T>;
};

export type Repository = {
  read(collection: Collection): Promise<ReadResult>;
  mutate(
    collection: Collection,
    operation: Mutation,
    session: MutationSession
  ): Promise<MutationResult>;
};

export const limits = {
  historyText: 64 * 1024,
  historyFile: 8 * 1024 * 1024,
  draftText: 256 * 1024,
  draftCount: 1000,
  draftFile: 16 * 1024 * 1024,
  read: 64 * 1024 * 1024,
  recoveryCount: 5000,
  recoveryRecord: 8 * 1024 * 1024,
  queueCount: 250,
  queueBytes: 8 * 1024 * 1024
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PromptError extends Error {}

/** Never expose arbitrary exception messages: JSON/host errors can include source text. */
export function errorMessage(error: unknown): string {
  return error instanceof PromptError
    ? error.message
    : "Prompt storage or host operation failed. Check private access and available disk space.";
}
