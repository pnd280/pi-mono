import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import type * as ProperLockfile from "proper-lockfile";
import { z } from "zod";

import { renameWithRetrySync } from "../file-rename/index.ts";
import { MAX_SETTINGS_FILE_BYTES, readSettingsFile } from "./read.ts";

const recordSchema = z.record(z.string(), z.unknown());

let lockfile: typeof ProperLockfile | undefined;

// Every settings reader evaluates this module at startup; only writes need the lock library,
// which also installs process exit handlers when loaded. Updates are synchronous, so require it.
function loadLockfile(): typeof ProperLockfile {
  const load: (id: string) => typeof ProperLockfile = createRequire(import.meta.url);

  return (lockfile ??= load("proper-lockfile"));
}

/** Validate without replacing the record: schema output can omit reserved own keys. */
export function isSettingsRecord(value: unknown): value is Record<string, unknown> {
  return recordSchema.safeParse(value).success;
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readSettingsRecord(path: string): Record<string, unknown> {
  try {
    const source = readSettingsFile(path);
    if (source === undefined)
      throw new Error("Settings must be a complete regular file up to 1 MiB.");
    if (source === "") return {};

    const record: unknown = JSON.parse(source.startsWith("\uFEFF") ? source.slice(1) : source);
    if (!isSettingsRecord(record)) throw new Error("Settings must be a JSON object.");

    return record;
  } catch (error) {
    if (missing(error)) return {};
    throw new Error(
      "Cannot read settings. Check access, JSON syntax, and the 1 MiB regular-file limit."
    );
  }
}

function writeTarget(path: string): string {
  try {
    lstatSync(path);
  } catch (error) {
    if (missing(error)) return path;
    throw error;
  }

  // Preserve dotfile symlinks; never replace a dangling link.
  return realpathSync(path);
}

/** Pi-compatible lock around a bounded read/merge/atomic rename. Mutators may reject the write. */
export function updateSettingsRecord(
  path: string,
  update: (record: Record<string, unknown>) => void
): void {
  let temporary: string | undefined;
  let release: (() => void) | undefined;

  try {
    mkdirSync(dirname(path), { recursive: true });
    release = loadLockfile().lockSync(path, { realpath: false });
    const target = writeTarget(path);
    const record = readSettingsRecord(path);
    // A void callback type also accepts async functions. Never commit a
    // record before its mutation finishes.
    const outcome: unknown = update(record);

    if (
      outcome !== null &&
      (typeof outcome === "object" || typeof outcome === "function") &&
      "then" in outcome &&
      typeof outcome.then === "function"
    ) {
      // The rejected mutation is no longer ours to await, but its rejection
      // must not surface as an unhandled promise after releasing the lock.
      void Promise.resolve(outcome).catch(() => {});
      throw new TypeError("Settings mutations must be synchronous.");
    }

    const content = `${JSON.stringify(record, null, 2)}\n`;
    if (Buffer.byteLength(content) > MAX_SETTINGS_FILE_BYTES)
      throw new Error("Settings exceed 1 MiB.");
    let mode = 0o600;

    try {
      mode = statSync(path).mode & 0o777;
    } catch (error) {
      if (!missing(error)) throw error;
    }

    temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, content, { flag: "wx", mode });
    // Creation applies the process umask; replacement must retain the original permissions.
    chmodSync(temporary, mode);
    renameWithRetrySync(temporary, target);
  } finally {
    try {
      if (temporary) rmSync(temporary, { force: true });
    } finally {
      release?.();
    }
  }
}
