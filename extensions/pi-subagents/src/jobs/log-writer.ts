import { open, type FileHandle } from "node:fs/promises";
import { Writable } from "node:stream";

/** Includes the omission marker. Compact to half the limit to avoid rewriting on every chunk. */
const MAX_LOG_BYTES = 16 * 1024 * 1024;
const RETAIN_LOG_BYTES = MAX_LOG_BYTES / 2;

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/** A private, bounded log. All writes and compactions use the original handle, never its path. */
export class JobLog extends Writable {
  private handle: FileHandle | undefined;
  private size = 0;
  private headerBytes = 0;
  private omitted = 0n;

  constructor(private path: string) {
    super();
  }

  override _construct(callback: (error?: Error | null) => void): void {
    void open(this.path, "wx+", 0o600).then(
      (handle) => {
        this.handle = handle;
        this.emit("open");
        callback();
      },
      (error: unknown) => callback(asError(error))
    );
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    void this.append(chunk).then(
      () => callback(),
      (error: unknown) => callback(asError(error))
    );
  }

  override _writev(chunks: { chunk: Buffer }[], callback: (error?: Error | null) => void): void {
    void this.append(Buffer.concat(chunks.map(({ chunk }) => chunk))).then(
      () => callback(),
      (error: unknown) => callback(asError(error))
    );
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.handle) {
      callback(error);

      return;
    }

    void this.handle.close().then(
      () => callback(error),
      (closeError: unknown) => callback(error ?? asError(closeError))
    );
  }

  private async append(data: Buffer): Promise<void> {
    const handle = this.handle;
    if (!handle) throw new Error("Job log is not open");

    if (this.size + data.length <= MAX_LOG_BYTES) {
      await this.writeAll(handle, data, this.size);
      this.size += data.length;

      return;
    }

    const previousBytes = Math.max(0, RETAIN_LOG_BYTES - data.length);
    const previous = Buffer.alloc(previousBytes);

    if (previousBytes) {
      const { bytesRead } = await handle.read(
        previous,
        0,
        previousBytes,
        this.size - previousBytes
      );
      if (bytesRead !== previousBytes) throw new Error("Job log changed during compaction");
    }

    const tail = Buffer.concat([previous, data.subarray(-RETAIN_LOG_BYTES)]);
    this.omitted += BigInt(this.size - this.headerBytes + data.length - tail.length);
    const header = Buffer.from(`[Earlier output omitted: ${this.omitted} bytes]\n`);
    const retained = Buffer.concat([header, tail]);
    // Shorten first: even a stalled or failed rewrite cannot grow the file beyond the cap.
    await handle.truncate(retained.length);
    await this.writeAll(handle, retained, 0);
    this.headerBytes = header.length;
    this.size = retained.length;
  }

  private async writeAll(handle: FileHandle, data: Buffer, position: number): Promise<void> {
    let offset = 0;

    while (offset < data.length) {
      const { bytesWritten } = await handle.write(
        data,
        offset,
        data.length - offset,
        position + offset
      );
      if (!bytesWritten) throw new Error("Job log write made no progress");
      offset += bytesWritten;
    }
  }
}
