import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { addDraft } from "../drafts.ts";
import { captureText, retainHistory } from "../history.ts";
import {
  errorMessage,
  limits,
  PromptError,
  type Collection,
  type Mutation,
  type MutationResult,
  type MutationSession,
  type Repository,
  type Snapshot
} from "../model.ts";
import { atomicReplace, type WriteHooks } from "./atomic.ts";
import { deleteTarget, encode, parseDocument, snapshot } from "./codec.ts";
import { acquireLock } from "./lock.ts";
import { boundedRead, collectionDirectory } from "./privacy.ts";

function apply(current: Snapshot, operation: Mutation, retention: number) {
  if (current.access === "read-only")
    throw new PromptError(
      "Collection has invalid occurrence IDs and is read-only. Back up and repair with sessions stopped."
    );
  if (operation.kind === "delete")
    return { ...current.document, entries: deleteTarget(current, operation.target) };
  const text = current.collection === "history" ? captureText(operation.text) : operation.text;

  if (text === undefined) return undefined;
  const entry = { id: randomUUID(), text, recordedAt: operation.recordedAt };

  return current.collection === "history"
    ? retainHistory(current.document, entry, retention)
    : addDraft(current, entry);
}

export class FileRepository implements Repository {
  private readonly queues: Record<Collection, Promise<unknown>> = {
    history: Promise.resolve(),
    drafts: Promise.resolve()
  };

  private constructor(
    private readonly options: {
      cwd: string;
      agentDir: string;
      hash: string;
      retention: number;
      hooks: WriteHooks;
    }
  ) {}

  static async create(options: {
    cwd: string;
    agentDir: string;
    retention: number;
    hooks?: WriteHooks;
  }): Promise<FileRepository> {
    let cwd: string;

    try {
      cwd = await realpath(options.cwd);
    } catch {
      throw new PromptError(
        "Cannot resolve the working directory's real path; prompt collections are unavailable."
      );
    }

    return new FileRepository({
      ...options,
      cwd,
      hash: createHash("sha256").update(cwd).digest("hex"),
      hooks: options.hooks ?? {}
    });
  }

  private async path(collection: Collection) {
    return join(
      await collectionDirectory(this.options.agentDir, this.options.hash),
      `${collection}.json`
    );
  }

  async read(collection: Collection) {
    try {
      const path = await this.path(collection);

      return parseDocument(collection, this.options.cwd, await boundedRead(path));
    } catch (error) {
      return { status: "unavailable" as const, message: errorMessage(error) };
    }
  }

  mutate(
    collection: Collection,
    operation: Mutation,
    session: MutationSession
  ): Promise<MutationResult> {
    const result = this.queues[collection].then(() =>
      this.mutateLatest(collection, operation, session)
    );
    this.queues[collection] = result.catch(() => {});

    return result;
  }

  private async mutateLatest(
    collection: Collection,
    operation: Mutation,
    session: MutationSession
  ): Promise<MutationResult> {
    try {
      session.signal.throwIfAborted();
      const path = await this.path(collection);
      session.signal.throwIfAborted();
      const lock = await acquireLock(`${path}.lock`, session.signal);
      let result: MutationResult;
      const cleanup: string[] = [];
      let released = false;

      const release = async () => {
        if (released) return;
        released = true;

        try {
          await lock.release();
        } catch {
          cleanup.push(
            "Collection lock cleanup failed; stop participating sessions before manual lock removal."
          );
        }
      };

      try {
        session.signal.throwIfAborted();
        const current = parseDocument(collection, this.options.cwd, await boundedRead(path));
        const document = apply(current, operation, this.options.retention);

        if (document === undefined) result = { status: "unchanged", snapshot: current };
        else {
          const content = encode(document);
          const bytes = Buffer.byteLength(content);
          const recoveryDeletion =
            collection === "drafts" &&
            current.access === "delete-only" &&
            operation.kind === "delete";

          if (
            recoveryDeletion
              ? bytes >= current.bytes
              : bytes > (collection === "history" ? limits.historyFile : limits.draftFile)
          )
            throw new PromptError(
              "Mutation exceeds collection capacity or would not reduce recovery file size; nothing was changed."
            );
          session.signal.throwIfAborted();
          // No await between the expiry check and entering the tracked atomic phase.
          const warnings = await session.atomic(async () => {
            try {
              return await atomicReplace(path, content, this.options.hooks);
            } finally {
              await release();
            }
          });
          result = {
            status: "committed",
            snapshot: snapshot(collection, document, bytes),
            warnings
          };
        }
      } catch (error) {
        result = { status: "failed", message: errorMessage(error) };
      } finally {
        await release();
      }

      if (result.status === "committed") result.warnings.push(...cleanup);
      else if (cleanup.length)
        result = {
          status: "failed",
          message: `${result.status === "failed" ? result.message + " " : ""}${cleanup.join(" ")}`
        };

      return result;
    } catch (error) {
      return { status: "failed", message: errorMessage(error) };
    }
  }
}
