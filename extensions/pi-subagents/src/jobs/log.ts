import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { Writable } from "node:stream";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";
import { decodeUtf8Window } from "@pi-mono/utils/utf8";

/** The one wording of both omission markers, so that the writer and the reader agree. */
const OMITTED = "Earlier output omitted";

/** Marks a tail that starts after the beginning of the log. */
const EARLIER_OUTPUT = `[${OMITTED}]`;

/** The first line of a compacted log file, with the cumulative count of omitted bytes. */
const omittedHeader = (bytes: bigint) => `[${OMITTED}: ${bytes} bytes]\n`;
const OMITTED_HEADER = new RegExp(`^\\[${OMITTED}: \\d+ bytes\\]\\n`);

/** A byte-bounded output window, with no partial leading UTF-8 character. */
export function formatLogTail(
  window: Buffer,
  clipped: boolean,
  { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES } = {}
): string {
  const text = clipped ? decodeUtf8Window(window, "tail").text : window.toString("utf8");
  const result = truncateTail(text, { maxBytes, maxLines });

  return clipped || result.truncated ? `${EARLIER_OUTPUT}\n${result.content}` : result.content;
}

/**
 * The end of a job's log file, at most `maxBytes` and `maxLines`. It reads only the file's last
 * bytes, never follows a link, and never blocks on a special file. On Windows, the open can follow
 * a link that replaced the path after `lstat`, but only the same regular file is read.
 */
export async function readLogTail(
  path: string,
  { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES } = {}
): Promise<string> {
  // Windows has no O_NOFOLLOW or O_NONBLOCK, so the opened file must also be the regular file that
  // lstat found. Big integers keep 64-bit NTFS file IDs exact.
  const entry = await lstat(path, { bigint: true });
  if (!entry.isFile()) throw new Error("Job log is not a regular file");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino)
      throw new Error("Job log changed while it was opened");
    const size = Number(stat.size);
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    const window = buffer.subarray(0, bytesRead);
    const clipped = size > length;
    const text = formatLogTail(window, clipped, { maxBytes, maxLines });
    // The viewer's smaller window must retain the disk omission count from the file's header.
    const header = Buffer.alloc(Math.min(size, 128));
    const head = await handle.read(header, 0, header.length, 0);
    const marker = OMITTED_HEADER.exec(header.subarray(0, head.bytesRead).toString("utf8"))?.[0];

    return marker && !text.startsWith(marker) ? `${marker}${text}` : text;
  } finally {
    await handle.close();
  }
}

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
    const header = Buffer.from(omittedHeader(this.omitted));
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
