import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";

import type { SavedOutput } from "../contracts.ts";
import {
  joinOutputText,
  outputOmission,
  sliceOutputText,
  type OutputText
} from "../output-text.ts";

export const SAVED_OUTPUT_BYTES = 256 * 1024;

export const SAVED_OUTPUT_LINES = 4000;

export const SAVED_OUTPUT_CACHE_ENTRIES = 8;

function utf8(buffer: Buffer, boundary?: "head" | "tail"): string {
  let start = 0;
  if (boundary === "tail")
    while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;

  // Only a bounded head may end inside a character. Keep literal BOMs/U+FFFD;
  // deleting decoded replacement characters would also delete valid output.
  return boundary === "head"
    ? new StringDecoder("utf8").write(buffer)
    : buffer.subarray(start).toString("utf8");
}

async function readOutput(path: string): Promise<SavedOutput> {
  let file;

  try {
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile())
      return {
        path,
        notice: "Saved output unavailable: not a regular file; showing retained output."
      };
    const size = Math.min(before.size, SAVED_OUTPUT_BYTES);
    const buffer = Buffer.alloc(size);
    const oversized = before.size > size;
    const head = oversized ? size / 2 : size;
    const first = await file.read(buffer, 0, head, 0);
    const last = oversized
      ? await file.read(buffer, head, size - head, before.size - (size - head))
      : undefined;
    const after = await file.stat();
    if (
      first.bytesRead !== head ||
      (last && last.bytesRead !== size - head) ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    )
      return { path, notice: "Saved output incomplete or changing; showing retained output." };
    let output: OutputText = oversized
      ? joinOutputText(
          [
            utf8(buffer.subarray(0, head), "head"),
            outputOmission(`… ${before.size - size} bytes omitted …`),
            utf8(buffer.subarray(head), "tail")
          ],
          "\n"
        )
      : { text: utf8(buffer) };
    const lines = output.text.split("\n");
    const lineLimited = lines.length > SAVED_OUTPUT_LINES;

    if (lineLimited) {
      const headLength = lines.slice(0, SAVED_OUTPUT_LINES / 2).join("\n").length;
      const tailLength = lines.slice(-SAVED_OUTPUT_LINES / 2).join("\n").length;
      output = joinOutputText(
        [
          sliceOutputText(output, 0, headLength),
          outputOmission(`… ${lines.length - SAVED_OUTPUT_LINES} retained lines omitted …`),
          sliceOutputText(output, output.text.length - tailLength)
        ],
        "\n"
      );
    }

    return {
      path,
      ...output,
      notice:
        oversized || lineLimited
          ? "Saved output is a bounded head/tail preview, not complete output."
          : undefined
    };
  } catch {
    return { path, notice: "Saved output unavailable; showing retained output." };
  } finally {
    await file?.close().catch(() => {});
  }
}

/** Session-scoped, bounded cache. Renderers never initiate reads. */
export class SavedOutputLoader {
  private cache = new Map<string, SavedOutput>();
  private pending = new Map<string, Promise<SavedOutput | undefined>>();
  private disposed = false;
  constructor(
    private loadFile: (path: string) => Promise<SavedOutput> = readOutput,
    private onEvict: (path: string) => void = () => {}
  ) {}
  load(path: string): Promise<SavedOutput | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    const cached = this.cache.get(path);

    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached);

      return Promise.resolve(cached);
    }

    const pending = this.pending.get(path);
    if (pending) return pending;
    if (this.pending.size >= SAVED_OUTPUT_CACHE_ENTRIES)
      return Promise.resolve({
        path,
        notice: "Saved-output loading limit reached; expand again to retry.",
        retryable: true
      });
    const promise = this.loadFile(path)
      .then((value) => {
        if (this.disposed) return undefined;

        if (this.cache.size >= SAVED_OUTPUT_CACHE_ENTRIES) {
          const evicted = this.cache.keys().next().value!;
          this.cache.delete(evicted);
          this.onEvict(evicted);
        }

        this.cache.set(path, value);

        return value;
      })
      .finally(() => this.pending.delete(path));
    this.pending.set(path, promise);

    return promise;
  }
  dispose(): void {
    this.disposed = true;
    this.cache.clear();
    this.pending.clear();
  }
}
