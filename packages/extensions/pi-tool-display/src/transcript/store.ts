import { randomUUID } from "node:crypto";
import { constants, writeSync } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

import {
  boundedRead,
  checkHandle,
  privateScopedDirectory,
  ReadLimitError
} from "@pi-mono/libs/private-files";
import { z } from "zod";

import { idSchema } from "./metadata.ts";

export const LOCAL_READ_BYTES = 8 * 1024 * 1024;

/** Far below the read limit, so one line cannot make its writer's file unreadable. */
const LINE_BYTES = 32 * 1024;

/** Diagnostics copy rejected input; this length keeps their lines below `LINE_BYTES`. */
const DIAGNOSTIC_TEXT = 1024;

const callLineSchema = z.object({
  type: z.literal("call"),
  entry: idSchema,
  toolCallId: idSchema,
  tool: z.string().max(1024),
  durationMs: z.number().nonnegative().optional(),
  savedOutput: z.string().min(1).max(4096).optional(),
  /** The writer saw the call but did not observe its operation. */
  reason: z.literal("not-observed").optional()
});

/** Machine-local details of one call; never result bodies, previews, or file content. */
export type LocalCall = Omit<z.infer<typeof callLineSchema>, "type">;

export type LocalDiagnostic = {
  code:
    | "session-record-rejected"
    | "session-write-failed"
    | "local-record-rejected"
    | "collection-failed";
  entry?: string;
  toolCallId?: string;
  detail: string;
};

export type LocalRead =
  | { status: "found"; calls: ReadonlyMap<string, LocalCall> }
  | { status: "absent" | "too-large" | "unreadable" };

export type WriterHeader = {
  sessionId: string;
  sessionFile: string | undefined;
  cwd: string;
  pi: string;
};

export type LocalStoreOptions = {
  /** Trusted parent, normally Pi's agent directory; it may be a symlink. */
  root: string;
  /** Sessions that Pi does not save keep their local details in memory only. */
  persisted: boolean;
  header: WriterHeader;
  warn(message: string): void;
};

export function localKey(entry: string, toolCallId: string): string {
  return JSON.stringify([entry, toolCallId]);
}

function parse(bytes: Buffer): { calls: Map<string, LocalCall>; skipped: number } {
  const calls = new Map<string, LocalCall>();
  const lines = bytes.toString("utf8").split("\n");
  // A process can stop during an append; the final line is complete only after its newline.
  lines.pop();
  let skipped = 0;

  for (const line of lines) {
    let value: unknown;

    try {
      value = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }

    const type = typeof value === "object" && value !== null && "type" in value && value.type;
    if (type === "writer" || type === "diagnostic") continue;
    const parsed = callLineSchema.safeParse(value);

    if (!parsed.success) {
      skipped++;
      continue;
    }

    const { type: _type, ...call } = parsed.data;
    calls.set(localKey(call.entry, call.toolCallId), call);
  }

  return { calls, skipped };
}

/**
 * One writer's append-only file: `<root>/pi-tool-display/calls/<writer>.jsonl`.
 * Each collector is one writer, so no other process appends to its file. Setup is
 * asynchronous; lines wait in memory until the file is ready, then each append is
 * one synchronous write, so a normal exit cannot drop a line written after setup.
 */
export class LocalStore {
  readonly writer = randomUUID();
  private current = new Map<string, LocalCall>();
  private reads = new Map<string, Promise<LocalRead>>();
  private queue: string[] = [];
  private handle: FileHandle | undefined;
  private setup: Promise<void> | undefined;
  private failed = false;
  /** Repeated disposal shares this wait, so every caller resolves after the close. */
  private disposal: Promise<void> | undefined;

  constructor(private options: LocalStoreOptions) {}

  private directory(): Promise<string> {
    return privateScopedDirectory({
      root: this.options.root,
      namespace: "pi-tool-display",
      key: "calls"
    });
  }

  /** Check the folders for reading without creating them; undefined when one is missing. */
  private async existingDirectory(): Promise<string | undefined> {
    try {
      await lstat(join(await realpath(this.options.root), "pi-tool-display", "calls"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }

    return this.directory();
  }

  private path(directory: string, writer: string): string {
    return join(directory, `${writer}.jsonl`);
  }

  /** Start file creation; the first tool start calls this so later appends rarely wait. */
  open(): void {
    if (this.setup || this.failed || this.disposal || !this.options.persisted) return;
    const header =
      JSON.stringify({
        type: "writer",
        ...this.options.header,
        started: new Date().toISOString()
      }) + "\n";
    // Session metadata has no length limit, so the header is bounded like call lines.
    if (Buffer.byteLength(header) > LINE_BYTES) return this.fail();
    this.queue.unshift(header);
    this.setup = this.create().catch(() => this.fail());
  }

  private async create(): Promise<void> {
    const path = this.path(await this.directory(), this.writer);
    const handle = await open(
      path,
      constants.O_WRONLY |
        constants.O_APPEND |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );

    try {
      await checkHandle(handle);
    } catch (error) {
      await handle.close();
      throw error;
    }

    this.handle = handle;
    // Lines queued before dispose are still written.
    for (const line of this.queue.splice(0)) this.write(handle, line);
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.queue = [];
    this.options.warn(
      "local call details cannot be saved; timing and saved-output references stay in memory."
    );
  }

  private append(line: string): void {
    if (this.failed || this.disposal || !this.options.persisted) return;
    if (this.handle) return this.write(this.handle, line);
    this.queue.push(line);
    this.open();
  }

  private write(handle: FileHandle, line: string): void {
    if (this.failed) return;

    try {
      const bytes = Buffer.from(line);
      let written = 0;
      while (written < bytes.length)
        written += writeSync(handle.fd, bytes, written, bytes.length - written);
    } catch {
      this.fail();
    }
  }

  /** Write only bounded lines that a later read accepts; a rejected line leaves a diagnostic. */
  call(call: LocalCall): void {
    const parsed = callLineSchema.safeParse({ type: "call", ...call });
    const line = parsed.success ? JSON.stringify(parsed.data) + "\n" : "";

    if (!parsed.success || Buffer.byteLength(line) > LINE_BYTES)
      return this.diagnostic({
        code: "local-record-rejected",
        entry: call.entry,
        toolCallId: call.toolCallId,
        detail: "local call line exceeds 32 KiB or fails validation"
      });

    const { type: _type, ...value } = parsed.data;
    this.current.set(localKey(value.entry, value.toolCallId), value);
    this.append(line);
  }

  diagnostic({ code, entry, toolCallId, detail }: LocalDiagnostic): void {
    const cut = (text: string | undefined) => text?.slice(0, DIAGNOSTIC_TEXT);
    this.append(
      JSON.stringify({
        type: "diagnostic",
        code,
        entry: cut(entry),
        toolCallId: cut(toolCallId),
        detail: cut(detail)
      }) + "\n"
    );
  }

  /** The current writer answers from memory; other files are read once each. */
  read(writer: string): Promise<LocalRead> {
    if (writer === this.writer)
      return Promise.resolve({ status: "found", calls: new Map(this.current) });
    let read = this.reads.get(writer);

    if (!read) {
      read = this.load(writer);
      this.reads.set(writer, read);
    }

    return read;
  }

  private async load(writer: string): Promise<LocalRead> {
    try {
      const directory = await this.existingDirectory();
      const bytes =
        directory === undefined
          ? undefined
          : await boundedRead(this.path(directory, writer), LOCAL_READ_BYTES);
      if (bytes === undefined) return { status: "absent" };
      const { calls, skipped } = parse(bytes);
      if (skipped)
        this.options.warn(`skipped ${skipped} invalid local detail lines of writer ${writer}.`);

      return { status: "found", calls };
    } catch (error) {
      return { status: error instanceof ReadLimitError ? "too-large" : "unreadable" };
    }
  }

  /** Wait for file creation, write queued lines, and close the file. */
  dispose(): Promise<void> {
    this.disposal ??= this.close();

    return this.disposal;
  }

  private async close(): Promise<void> {
    await this.setup;
    this.queue = [];
    const handle = this.handle;
    this.handle = undefined;

    try {
      await handle?.close();
    } catch {
      // A failed append has already warned about this file.
      if (!this.failed)
        this.options.warn("closing the local call details file failed; its lines may be lost.");
    }
  }
}
