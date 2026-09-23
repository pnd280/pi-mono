import { z } from "zod";

import { processPatch } from "./processor.ts";

const limitsSchema = z.object({
  maxSourceBytes: z.int().nonnegative(),
  maxPatchBytes: z.int().nonnegative(),
  maxEditLength: z.int().nonnegative(),
  contextLines: z.int().nonnegative()
});
const durationSchema = z.number().nonnegative();

export const patchLimitsSchema = limitsSchema.extend({ timeoutMs: durationSchema });

export type PatchLimits = z.infer<typeof patchLimitsSchema>;

export type BoundedPatchOptions = PatchLimits & {
  path: string;
  before: string;
  after: string;
};

export type BoundedPatchResult =
  | { status: "ready"; patch: string }
  | { status: "source-too-large" | "binary" | "budget-exceeded" | "patch-too-large" };

/** Generate a unified patch off-thread, with parent-enforced time and worker memory limits. */
export async function createBoundedPatch(
  options: BoundedPatchOptions
): Promise<BoundedPatchResult> {
  const { before, after, maxSourceBytes, timeoutMs } = options;
  if (!limitsSchema.safeParse(options).success)
    throw new RangeError("Diff limits must be nonnegative safe integers.");
  if (!durationSchema.safeParse(timeoutMs).success)
    throw new RangeError("Diff timeout must be a finite nonnegative duration.");
  if (Buffer.byteLength(before) > maxSourceBytes || Buffer.byteLength(after) > maxSourceBytes)
    return { status: "source-too-large" };
  if (before.includes("\0") || after.includes("\0")) return { status: "binary" };

  return processPatch({ ...options });
}
