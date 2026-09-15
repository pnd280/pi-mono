import { createPatch, FILE_HEADERS_ONLY } from "diff";
import { z } from "zod";

const limitsSchema = z.object({
  maxSourceBytes: z.int().nonnegative(),
  maxPatchBytes: z.int().nonnegative(),
  maxEditLength: z.int().nonnegative(),
  contextLines: z.int().nonnegative()
});
const durationSchema = z.number().nonnegative();

export type BoundedPatchOptions = z.infer<typeof limitsSchema> & {
  path: string;
  before: string;
  after: string;
  timeoutMs: number;
};

export type BoundedPatchResult =
  | { status: "ready"; patch: string }
  | { status: "source-too-large" | "binary" | "budget-exceeded" | "patch-too-large" };

/** Generate a unified patch with CRLF normalized to LF and bounded jsdiff search work. */
export function createBoundedPatch(options: BoundedPatchOptions): BoundedPatchResult {
  const {
    path,
    before,
    after,
    maxSourceBytes,
    maxPatchBytes,
    maxEditLength,
    timeoutMs,
    contextLines
  } = options;
  if (!limitsSchema.safeParse(options).success)
    throw new RangeError("Diff limits must be nonnegative safe integers.");
  if (!durationSchema.safeParse(timeoutMs).success)
    throw new RangeError("Diff timeout must be a finite nonnegative duration.");
  if (Buffer.byteLength(before) > maxSourceBytes || Buffer.byteLength(after) > maxSourceBytes)
    return { status: "source-too-large" };
  if (before.includes("\0") || after.includes("\0")) return { status: "binary" };
  // Bound actual edit distance rather than rejecting small changes in large files.
  const patch = createPatch(
    path,
    before.replaceAll("\r\n", "\n"),
    after.replaceAll("\r\n", "\n"),
    undefined,
    undefined,
    {
      context: contextLines,
      headerOptions: FILE_HEADERS_ONLY,
      maxEditLength,
      timeout: timeoutMs
    }
  );
  if (patch === undefined) return { status: "budget-exceeded" };
  if (Buffer.byteLength(patch) > maxPatchBytes) return { status: "patch-too-large" };

  return { status: "ready", patch };
}
