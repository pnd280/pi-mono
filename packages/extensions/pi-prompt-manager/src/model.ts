import type { WriteScope } from "@pi-mono/libs/private-files";
import { z } from "zod";

export type Collection = "history" | "drafts";

/** These schemas validate without normalizing source or rejecting recovery metadata. */
export const storedEntrySchema = z.looseObject({
  text: z.string().refine((text) => text.trim().length > 0)
});

export const documentSchema = z.looseObject({
  version: z.literal(1),
  cwd: z.string(),
  entries: z.array(storedEntrySchema)
});

/** Parsed JSON, including unknown fields, is retained rather than reconstructed. */
export type StoredEntry = z.infer<typeof storedEntrySchema>;

export type Document = z.infer<typeof documentSchema>;

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

export type Repository = {
  read(collection: Collection, signal?: AbortSignal): Promise<ReadResult>;
  mutate(collection: Collection, operation: Mutation, session: WriteScope): Promise<MutationResult>;
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

export const historyTextSchema = storedEntrySchema.shape.text.refine(
  (text) => Buffer.byteLength(text) <= limits.historyText
);

export const draftTextSchema = storedEntrySchema.shape.text.refine(
  (text) => Buffer.byteLength(text) <= limits.draftText
);

export class PromptError extends Error {}

/** Never expose arbitrary exception messages: JSON/host errors can include source text. */
export function errorMessage(error: unknown): string {
  return error instanceof PromptError
    ? error.message
    : "Prompt storage or host operation failed. Check private access and available disk space.";
}
