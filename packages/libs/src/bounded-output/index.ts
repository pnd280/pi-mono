import { constants } from "node:fs";
import { open } from "node:fs/promises";

import {
  joinOutputText,
  sliceOutputText,
  type OmissionFormatter,
  type OutputText
} from "@pi-mono/utils/output-text";
import { decodeUtf8 } from "@pi-mono/utils/utf8";
import { z } from "zod";

const limitsSchema = z.object({
  /** Total source bytes, split between head and tail for oversized files. */
  maxBytes: z.int().min(2),
  /** Preview lines retained after byte clipping, before adding a line-omission notice. */
  maxLines: z.int().min(2)
});

export type BoundedOutputOptions = z.infer<typeof limitsSchema> & {
  /** Generated notices can make the result exceed the source byte and line budgets. */
  formatOmission: OmissionFormatter;
};

export type BoundedOutputResult =
  | { status: "ready"; output: OutputText; truncated: boolean }
  | { status: "not-file" | "changed" | "unavailable" };

/**
 * Read a regular file without blocking on a FIFO. Reads follow symlinks; callers
 * establish path eligibility and sanitize the returned text before display.
 * Limits must be safe integers of at least two; invalid limits throw RangeError.
 * I/O failures return a status without raw OS diagnostics. Size and mtime checks
 * detect some concurrent writes but do not provide an atomic snapshot.
 * No cache or permission repair is performed.
 */
export async function readBoundedOutput(
  path: string,
  options: BoundedOutputOptions
): Promise<BoundedOutputResult> {
  const { maxBytes, maxLines, formatOmission } = options;
  if (!limitsSchema.safeParse(options).success)
    throw new RangeError("Output preview limits must be safe integers of at least two.");
  let file;

  try {
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile()) return { status: "not-file" };
    const size = Math.min(before.size, maxBytes);
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
      return { status: "changed" };
    let output: OutputText = oversized
      ? joinOutputText(
          [
            decodeUtf8(buffer.subarray(0, head), "head"),
            formatOmission({ count: before.size - size, unit: "bytes" }),
            decodeUtf8(buffer.subarray(head), "tail")
          ],
          "\n"
        )
      : { text: decodeUtf8(buffer) };
    const lines = output.text.split("\n");
    const lineLimited = lines.length > maxLines;

    if (lineLimited) {
      const headLength = lines.slice(0, Math.ceil(maxLines / 2)).join("\n").length;
      const tailLength = lines.slice(-Math.floor(maxLines / 2)).join("\n").length;
      output = joinOutputText(
        [
          sliceOutputText(output, 0, headLength),
          formatOmission({ count: lines.length - maxLines, unit: "retained-lines" }),
          sliceOutputText(output, output.text.length - tailLength)
        ],
        "\n"
      );
    }

    return { status: "ready", output, truncated: oversized || lineLimited };
  } catch {
    return { status: "unavailable" };
  } finally {
    await file?.close().catch(() => {});
  }
}
