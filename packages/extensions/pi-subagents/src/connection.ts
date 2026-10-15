import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import type {
  JsonAgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse
} from "@earendil-works/pi-coding-agent";
import { OutputBuffer } from "@pi-mono/libs/output-buffer";
import { z } from "zod";

import { STDERR_EDGE_LINES, STDERR_LINE_BYTES, STDERR_MAX_BYTES } from "./constants.ts";

export type RpcRecord = RpcResponse | RpcExtensionUIRequest | JsonAgentSessionEvent;

export type ProcessExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

type PendingCommand = {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
};

const envelopeSchema = z.looseObject({ type: z.string() });

/** Pi owns payload schemas. Validate the envelope and use its public wire union. */
function decodeRecord(line: string): RpcRecord {
  const value: unknown = JSON.parse(line);
  if (!envelopeSchema.safeParse(value).success) throw new Error("Invalid Pi RPC record");

  // The peer is the selected Pi executable, not an arbitrary JSON service.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as RpcRecord;
}

export class ChildConnection {
  readonly closed: Promise<ProcessExit>;
  private pending = new Map<string, PendingCommand>();
  private listeners = new Set<(record: RpcRecord) => void>();
  private drainListeners = new Set<() => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private nextId = 0;
  private inputClosed = false;
  private failure: Error | undefined;
  private exit: ProcessExit | undefined;
  private writes: Promise<void> = Promise.resolve();
  private decoder = new StringDecoder("utf8");
  private buffered = "";
  private stderr = new OutputBuffer({
    maxBytes: STDERR_MAX_BYTES,
    edgeLines: STDERR_EDGE_LINES,
    lineBytes: STDERR_LINE_BYTES,
    formatOmission: ({ count, unit }) => ({ text: `[${count} stderr ${unit} omitted]` })
  });

  constructor(readonly process: ChildProcessWithoutNullStreams) {
    process.stdout.on("data", (chunk: Buffer) => this.ingest(this.decoder.write(chunk)));
    process.stdout.on("end", () => this.ingest(this.decoder.end()));
    process.stderr.on("data", (chunk: Buffer) => this.stderr.append(chunk));
    process.stderr.on("end", () => this.stderr.finish());
    process.stdin.on("error", (error: Error) => this.fail(error));
    process.stdout.on("error", (error: Error) => this.fail(error));
    process.stderr.on("error", (error: Error) => this.fail(error));
    process.once("error", (error) => this.fail(error));
    process.once("exit", (code, signal) => {
      this.exit = { code, signal };
      this.rejectPending(new Error(`Pi exited (code ${code}, signal ${signal})`));
    });
    this.closed = new Promise((resolve) => {
      process.once("close", (code, signal) => {
        this.stderr.finish();
        this.exit = { code, signal, ...(this.failure ? { error: this.failure } : {}) };
        this.rejectPending(new Error(`Pi closed (code ${code}, signal ${signal})`));
        resolve(this.exit);
      });
    });
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get stderrTail(): string {
    return this.stderr.snapshot().text;
  }

  subscribe(listener: (record: RpcRecord) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  onDrain(listener: () => void): () => void {
    this.drainListeners.add(listener);

    return () => this.drainListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);

    return () => this.errorListeners.delete(listener);
  }

  request(command: RpcCommand): Promise<RpcResponse> {
    if (this.inputClosed || this.exit || this.failure) {
      return Promise.reject(this.failure ?? new Error("Pi connection is closed"));
    }

    const id = String(++this.nextId);
    const response = new Promise<RpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    void this.write({ ...command, id }).catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });

    return response;
  }

  respond(response: RpcExtensionUIResponse): Promise<void> {
    return this.write(response);
  }

  closeInput(): void {
    if (this.inputClosed) return;
    this.inputClosed = true;
    // Flush clear_queue and abort before EOF, without waiting for their RPC responses.
    void this.writes.then(() => this.process.stdin.end());
  }

  private write(record: RpcCommand | RpcExtensionUIResponse): Promise<void> {
    if (this.inputClosed || this.exit || this.failure) {
      return Promise.reject(this.failure ?? new Error("Pi connection is closed"));
    }

    const line = `${JSON.stringify(record)}\n`;
    const written = this.writes.then(
      () =>
        new Promise<void>((resolve, reject) => {
          // Awaiting the write callback also honours pipe backpressure.
          this.process.stdin.write(line, (error) => (error ? reject(error) : resolve()));
        })
    );
    this.writes = written.catch(() => {});

    return written;
  }

  private ingest(text: string): void {
    // Search only new text, so a record split over many chunks is scanned once.
    let newline = text.indexOf("\n");

    if (newline === -1) {
      this.buffered += text;

      return;
    }

    const data = this.buffered + text;
    newline += this.buffered.length;
    let start = 0;

    while (newline !== -1) {
      const line = data.slice(start, newline).replace(/\r$/, "");
      start = newline + 1;

      try {
        this.dispatch(decodeRecord(line));
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }

      newline = data.indexOf("\n", start);
    }

    this.buffered = data.slice(start);
  }

  private dispatch(record: RpcRecord): void {
    if (record.type === "response" && record.id !== undefined) {
      const pending = this.pending.get(record.id);
      this.pending.delete(record.id);
      pending?.resolve(record);
    }

    // Observers see prompt dispositions before an empty command queue can trigger settling.
    for (const listener of this.listeners) listener(record);

    if (this.pending.size === 0) {
      for (const listener of this.drainListeners) listener();
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.rejectPending(error);
    for (const listener of this.errorListeners) listener(error);
  }
}
