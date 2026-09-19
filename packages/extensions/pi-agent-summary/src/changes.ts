import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createBoundedPatch } from "@pi-mono/libs/bounded-diff";
import { observeTextFile, type FileObservation } from "@pi-mono/libs/file-observation";
import { parsePatch } from "@pi-mono/utils/patch";
import { expandHomePath, relativeDisplayPath } from "@pi-mono/utils/paths";

import type { FileChange } from "./summary.ts";

const SOURCE_BYTES = 64 * 1024;
const PATCH_BYTES = 128 * 1024;

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    // Resolve the nearest existing ancestor when write will create parent directories.
    const parent = dirname(path);
    if (parent === path) return path;

    return join(await canonicalPath(parent), basename(path));
  }
}

function targetPath(input: string, cwd: string): Promise<string> {
  const normalized = input
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/^@/, "");
  const expanded = normalized.startsWith("file://")
    ? fileURLToPath(normalized)
    : expandHomePath(normalized, homedir());

  return canonicalPath(resolve(cwd, expanded));
}

function source(observation: FileObservation): string | undefined {
  if (observation.status === "ready") return observation.text;
  if (observation.status === "missing") return "";

  return undefined;
}

function compare(
  path: string,
  before: FileObservation,
  after: FileObservation
): FileChange | undefined {
  const original = source(before);
  const current = source(after);
  if (original === undefined || current === undefined)
    return {
      path,
      status: "unavailable",
      reason: "Could not read complete UTF-8 source within 64 KiB."
    };
  if (before.status === after.status && original === current) return;

  const result = createBoundedPatch({
    path: "file",
    before: original,
    after: current,
    maxSourceBytes: SOURCE_BYTES,
    maxPatchBytes: PATCH_BYTES,
    maxEditLength: 2000,
    timeoutMs: 50,
    contextLines: 0
  });

  if (result.status === "ready") {
    const patch = parsePatch(result.patch, PATCH_BYTES);
    if (patch) return { path, status: "available", added: patch.added, removed: patch.removed };
  }

  return {
    path,
    status: "unavailable",
    reason:
      result.status === "binary" ? "Binary content." : "Line statistics exceeded the diff budget."
  };
}

type ObservedFile = {
  before: Promise<FileObservation>;
  after?: Promise<FileObservation>;
};

/** Observe only edit/write targets, retaining one baseline and the latest result per file. */
export class RunChanges {
  private readonly cwd: string;
  private readonly files = new Map<string, ObservedFile>();
  private readonly calls = new Map<string, string>();
  private readonly completed = new Map<
    string,
    { before: FileObservation; after: FileObservation }
  >();

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async beforeCall(toolCallId: string, input: string): Promise<void> {
    let path: string;

    try {
      path = await targetPath(input, this.cwd);
    } catch {
      // Invalid paths must not turn observational hooks into a tool permission gate.
      return;
    }

    this.calls.set(toolCallId, path);
    let file = this.files.get(path);

    if (!file) {
      file = { before: observeTextFile(path, SOURCE_BYTES) };
      this.files.set(path, file);
    }

    await file.before;
  }

  async afterCall(toolCallId: string): Promise<void> {
    const path = this.calls.get(toolCallId);
    if (path === undefined) return;
    this.calls.delete(toolCallId);
    const file = this.files.get(path);
    if (!file) return;
    const after = observeTextFile(path, SOURCE_BYTES);
    file.after = after;
    const [beforeValue, afterValue] = await Promise.all([file.before, after]);
    // Parallel result hooks must not overwrite a newer observation with an older read.
    if (file.after === after) this.completed.set(path, { before: beforeValue, after: afterValue });
  }

  finish(): FileChange[] {
    const changes: FileChange[] = [];

    for (const [path, { before, after }] of this.completed) {
      const change = compare(relativeDisplayPath(path, this.cwd), before, after);
      if (change) changes.push(change);
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }
}
