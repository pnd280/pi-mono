import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { z } from "zod";

const sizeSchema = z.int().nonnegative();

export type FileObservation =
  | { status: "ready"; text: string }
  | { status: "missing" | "not-file" | "too-large" | "changed" | "invalid-utf8" | "unavailable" };

/** Read complete UTF-8 source or refuse. Follows symlinks, without permission repair or clipping. */
export async function observeTextFile(path: string, maxBytes: number): Promise<FileObservation> {
  if (!sizeSchema.safeParse(maxBytes).success)
    throw new RangeError("Observation size must be a nonnegative safe integer.");
  let file;

  try {
    // Do not wait for a writer when a path is a FIFO; inspect the opened descriptor first.
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { status: "missing" };
      throw error;
    }

    const before = await file.stat();
    if (!before.isFile()) return { status: "not-file" };
    if (before.size > maxBytes) return { status: "too-large" };
    const buffer = Buffer.alloc(before.size + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const after = await file.stat();
    if (bytesRead !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      return { status: "changed" };

    try {
      return {
        status: "ready",
        text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          buffer.subarray(0, bytesRead)
        )
      };
    } catch {
      return { status: "invalid-utf8" };
    }
  } catch {
    return { status: "unavailable" };
  } finally {
    await file?.close().catch(() => {});
  }
}
