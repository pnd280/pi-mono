import { constants } from "node:fs";
import { open } from "node:fs/promises";

import {
  joinOutputText,
  outputOmission,
  sliceOutputText,
  type OutputText
} from "@pi-mono/utils/output-text";
import { decodeUtf8Window } from "@pi-mono/utils/utf8";

import type { SavedOutput } from "../contracts.ts";

/** Total source bytes, split between head and tail for oversized files. */
const SAVED_OUTPUT_BYTES = 256 * 1024;

/** Preview lines retained after byte clipping, before adding a line-omission notice. */
const SAVED_OUTPUT_LINES = 4000;

/**
 * A bounded head/tail preview of a saved-output file, or a notice that keeps retained output.
 * Opening never blocks on a FIFO, and reads follow symlinks; renderers sanitise the text
 * before display. Omission notices can make the preview exceed the byte and line budgets,
 * and omitted-byte counts include incomplete UTF-8 at clipped boundaries. Size and mtime
 * checks detect some concurrent writes but do not provide an atomic snapshot.
 */
export async function readSavedOutput(path: string): Promise<SavedOutput> {
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
    const head = oversized ? Math.ceil(size / 2) : size;
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
    const prefix = decodeUtf8Window(buffer.subarray(0, head), oversized ? "head" : undefined);
    const suffix = decodeUtf8Window(buffer.subarray(head), "tail");
    const omittedBytes = before.size - size + prefix.omittedBytes + suffix.omittedBytes;
    let output: OutputText = oversized
      ? joinOutputText(
          [prefix.text, outputOmission(`… ${omittedBytes} bytes omitted …`), suffix.text],
          "\n"
        )
      : { text: prefix.text };
    const lines = output.text.split("\n");
    const lineLimited = lines.length > SAVED_OUTPUT_LINES;

    if (lineLimited) {
      const headLength = lines.slice(0, Math.ceil(SAVED_OUTPUT_LINES / 2)).join("\n").length;
      const tailLength = lines.slice(-Math.floor(SAVED_OUTPUT_LINES / 2)).join("\n").length;
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
