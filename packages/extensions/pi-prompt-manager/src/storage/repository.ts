import { join } from "node:path";

import {
  boundedRead,
  LockTimeoutError,
  PrivateFileError,
  privateScopedDirectory,
  PrivateFileTransactions,
  ReadLimitError,
  resolveDirectoryScope,
  type AtomicWriteWarning,
  type DirectoryScope,
  type WriteHooks,
  type WriteScope
} from "@pi-mono/libs/private-files";

import {
  errorMessage,
  limits,
  PromptError,
  type Collection,
  type Mutation,
  type MutationResult,
  type Repository
} from "../model.ts";
import { reductionGuidance } from "./collection.ts";
import { readCollectionAsync, updateCollectionAsync } from "./processing.ts";

function storageErrorMessage(error: unknown): string {
  if (error instanceof ReadLimitError)
    return `Collection exceeds the 64 MiB read bound. ${reductionGuidance}`;
  if (error instanceof LockTimeoutError)
    return "Collection is busy (two-second lock deadline). Abandoned locks require manual removal with all participating sessions stopped.";

  return error instanceof PrivateFileError ? error.message : errorMessage(error);
}

const writeWarnings: Record<AtomicWriteWarning, string> = {
  "post-commit": "Collection committed, but post-commit cleanup failed.",
  close: "Collection committed, but closing its temporary descriptor failed."
};

export class FileRepository implements Repository {
  private readonly transactions = new PrivateFileTransactions();

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
    let scope: DirectoryScope;

    try {
      scope = await resolveDirectoryScope(options.cwd);
    } catch {
      throw new PromptError(
        "Cannot resolve the working directory's real path; prompt collections are unavailable."
      );
    }

    return new FileRepository({
      ...options,
      cwd: scope.path,
      hash: scope.key,
      hooks: options.hooks ?? {}
    });
  }

  private async path(collection: Collection) {
    if (process.platform !== "linux" && process.platform !== "darwin")
      throw new PromptError(
        "Prompt storage supports Linux, macOS, and WSL local filesystems only."
      );

    return join(
      await privateScopedDirectory({
        root: this.options.agentDir,
        namespace: "pi-prompt-manager",
        key: this.options.hash
      }),
      `${collection}.json`
    );
  }

  async read(collection: Collection, signal?: AbortSignal) {
    try {
      signal?.throwIfAborted();
      const path = await this.path(collection);

      return await readCollectionAsync({
        collection,
        cwd: this.options.cwd,
        raw: await boundedRead(path, limits.read),
        ...(signal ? { signal } : {})
      });
    } catch (error) {
      return { status: "unavailable" as const, message: storageErrorMessage(error) };
    }
  }

  async mutate(
    collection: Collection,
    operation: Mutation,
    session: WriteScope
  ): Promise<MutationResult> {
    const result = await this.transactions.run(collection, {
      path: () => this.path(collection),
      scope: session,
      maxReadBytes: limits.read,
      timeoutMs: 2000,
      hooks: this.options.hooks,
      update: (raw) =>
        updateCollectionAsync({
          collection,
          cwd: this.options.cwd,
          raw,
          operation,
          retention: this.options.retention,
          signal: session.signal
        })
    });
    const cleanup = result.cleanupErrors.length
      ? ["Collection lock cleanup failed; stop participating sessions before manual lock removal."]
      : [];
    if (result.status === "committed")
      return {
        status: "committed",
        snapshot: result.value,
        warnings: [...result.warnings.map((warning) => writeWarnings[warning]), ...cleanup]
      };
    if (result.status === "failed" || cleanup.length)
      return {
        status: "failed",
        message: [result.status === "failed" ? storageErrorMessage(result.cause) : "", ...cleanup]
          .filter(Boolean)
          .join(" ")
      };

    return { status: "unchanged", snapshot: result.value };
  }
}
