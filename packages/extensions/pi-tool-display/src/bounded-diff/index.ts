import { processPatch } from "./processor.ts";

export { PATCH_QUEUE_BYTES } from "./processor.ts";

export type PatchLimits = {
  maxSourceBytes: number;
  maxPatchBytes: number;
  maxEditLength: number;
  contextLines: number;
  timeoutMs: number;
};

export type BoundedPatchOptions = PatchLimits & {
  path: string;
  before: string;
  after: string;
};

export type BoundedPatchResult =
  | { status: "ready"; patch: string }
  | {
      status:
        | "source-too-large"
        | "binary"
        | "budget-exceeded"
        | "patch-too-large"
        | "queue-full"
        | "worker-failed";
    };

/** Generate a unified patch off-thread, with parent-enforced time and worker memory limits. */
export async function createBoundedPatch(
  options: BoundedPatchOptions
): Promise<BoundedPatchResult> {
  const {
    before,
    after,
    path,
    maxSourceBytes,
    maxPatchBytes,
    maxEditLength,
    contextLines,
    timeoutMs
  } = options;
  if (Buffer.byteLength(before) > maxSourceBytes || Buffer.byteLength(after) > maxSourceBytes)
    return { status: "source-too-large" };
  if (before.includes("\0") || after.includes("\0")) return { status: "binary" };

  // Retain only budgeted fields; caller objects can carry unrelated data or non-cloneable values.
  return processPatch({
    maxSourceBytes,
    maxPatchBytes,
    maxEditLength,
    contextLines,
    timeoutMs,
    path,
    before,
    after
  });
}
