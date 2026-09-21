import { createBoundedPatch } from "@pi-mono/libs/bounded-diff";
import {
  observedSource,
  type FileMutation,
  type MutationPatch,
  type MutationSink
} from "@pi-mono/libs/file-mutations";
import type { FileObservation } from "@pi-mono/libs/file-observation";
import { parsePatch } from "@pi-mono/utils/patch";
import { relativeDisplayPath } from "@pi-mono/utils/paths";
import { z } from "zod";

import type { FileChange } from "./summary.ts";

const WRITE_FAILURE = "File write failed; final contents were not observed.";
const RETAINED_BYTES = 16 * 1024 * 1024;
const PATCH_LIMITS = {
  maxSourceBytes: 8 * 1024 * 1024,
  maxPatchBytes: 128 * 1024,
  maxEditLength: 2000,
  timeoutMs: 50,
  contextLines: 4
};

function statistics(path: string, result: MutationPatch): FileChange {
  if (result.status === "ready") {
    const patch = parsePatch(result.patch, PATCH_LIMITS.maxPatchBytes);
    if (patch) return { path, status: "available", added: patch.added, removed: patch.removed };

    return { path, status: "unavailable", reason: "Invalid tool patch." };
  }

  const reasons = {
    "source-unavailable": "Complete source unavailable for comparison.",
    "source-too-large": "Source exceeds the 8 MiB observation budget.",
    binary: "Binary content.",
    "patch-too-large": "Patch exceeds the 128 KiB retention limit.",
    "budget-exceeded": "Diff generation exceeded 50 ms, 2000 changed lines, or worker resources."
  };

  return { path, status: "unavailable", reason: reasons[result.status] };
}

function sourceReason(source: FileObservation): string | undefined {
  switch (source.status) {
    case "ready":
      return source.text.includes("\0") ? "Binary content." : undefined;
    case "missing":
      return undefined;
    case "too-large":
      return "Source exceeds the 8 MiB observation budget.";
    case "invalid-utf8":
      return "Source is not valid UTF-8.";
    case "changed":
      return "Source changed during observation.";
    case "not-file":
      return "Target is not a regular file.";
    case "unavailable":
      return "Source could not be read.";
  }
}

async function mutationStatistics(path: string, mutation: FileMutation): Promise<FileChange> {
  if (mutation.outcome === "failure") return { path, status: "unavailable", reason: WRITE_FAILURE };

  let patchFallbackReason: string | undefined;

  for (const source of [mutation.before, mutation.after]) {
    const reason = sourceReason(source);
    if (!reason) continue;
    // Native edit patches remain useful even if source retention is unavailable.
    if (source.status === "too-large") patchFallbackReason ??= reason;
    else return { path, status: "unavailable", reason };
  }

  const before = observedSource(mutation.before);
  if (before !== undefined && before === observedSource(mutation.after))
    return { path, status: "available", added: 0, removed: 0 };

  const result = await mutation.patch(PATCH_LIMITS);
  if (result.status === "source-unavailable" && patchFallbackReason)
    return { path, status: "unavailable", reason: patchFallbackReason };

  return statistics(path, result);
}

type ObservedFile = {
  firstSequence: number;
  lastSequence: number;
  count: number;
  before: string | undefined;
  after: string | undefined;
  created: boolean;
  bytes: number;
  single: Promise<FileChange>;
  firstReason?: string | undefined;
  lastReason?: string | undefined;
  retentionReason?: string | undefined;
};

/** Retains only the baseline/latest source; tool patches and intermediate snapshots stay call-scoped. */
export class RunChanges {
  private files = new Map<string, ObservedFile>();
  private retainedBytes = 0;

  constructor(
    private cwd: string,
    private maxRetainedBytes = RETAINED_BYTES
  ) {
    if (!z.int().nonnegative().safeParse(maxRetainedBytes).success)
      throw new RangeError("Retained source budget must be a nonnegative safe integer.");
  }

  sink(): MutationSink {
    return {
      maxSourceBytes: PATCH_LIMITS.maxSourceBytes,
      completed: (mutation) => this.record(mutation)
    };
  }

  async record(mutation: FileMutation): Promise<void> {
    const path = relativeDisplayPath(mutation.path, this.cwd);
    const before = observedSource(mutation.before);
    const after = mutation.outcome === "success" ? observedSource(mutation.after) : undefined;
    const existing = this.files.get(path);
    const beforeReason = sourceReason(mutation.before);
    const afterReason =
      mutation.outcome === "failure" ? WRITE_FAILURE : sourceReason(mutation.after);
    const single = existing?.single ?? mutationStatistics(path, mutation);
    const file: ObservedFile = existing ?? {
      firstSequence: mutation.sequence,
      lastSequence: mutation.sequence,
      count: 0,
      before,
      after,
      created: mutation.before.status === "missing",
      bytes: 0,
      single,
      firstReason: beforeReason,
      lastReason: afterReason
    };

    if (mutation.sequence < file.firstSequence) {
      file.firstSequence = mutation.sequence;
      file.before = before;
      file.firstReason = beforeReason;
      file.created = mutation.before.status === "missing";
    }

    if (mutation.sequence >= file.lastSequence) {
      file.lastSequence = mutation.sequence;
      file.after = after;
      file.lastReason = afterReason;
    }

    file.count++;
    this.retainedBytes -= file.bytes;
    // UTF-16 code units conservatively budget retained JS strings, not just UTF-8 disk bytes.
    file.bytes = 2 * ((file.before?.length ?? 0) + (file.after?.length ?? 0));

    if (this.retainedBytes + file.bytes > this.maxRetainedBytes || file.retentionReason) {
      file.before = undefined;
      file.after = undefined;
      file.bytes = 0;
      file.retentionReason ??= `Run source retention budget exceeded (${this.maxRetainedBytes} bytes).`;
    }

    this.retainedBytes += file.bytes;
    this.files.set(path, file);
    // Publish endpoints before awaiting a patch: sibling calls can finish in any order.
    await single;
  }

  async finish(): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const files = this.files;
    this.files = new Map();
    this.retainedBytes = 0;

    for (const [path, file] of files) {
      const reason = file.retentionReason ?? file.firstReason ?? file.lastReason;
      if (!reason && !file.created && file.before !== undefined && file.before === file.after)
        continue;
      if (file.count === 1) changes.push(await file.single);
      else if (reason || file.before === undefined || file.after === undefined)
        changes.push({
          path,
          status: "unavailable",
          reason: reason ?? "Complete source unavailable for net comparison."
        });
      else
        changes.push(
          statistics(
            path,
            await createBoundedPatch({
              path: "file",
              before: file.before,
              after: file.after,
              ...PATCH_LIMITS
            })
          )
        );
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }
}
