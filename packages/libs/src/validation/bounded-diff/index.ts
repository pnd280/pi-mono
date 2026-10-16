import { onTestFinished, vi } from "vite-plus/test";

import * as boundedDiff from "../../bounded-diff/index.ts";
import { STEP_TIMEOUT_MS } from "../pi-process/index.ts";

/**
 * For the rest of the current test, give every bounded patch the step deadline instead of
 * its caller's time budget. The budget is wall-clock time that suite load can exceed.
 */
export function useStepPatchDeadline(): void {
  const create = boundedDiff.createBoundedPatch;
  const patch = vi
    .spyOn(boundedDiff, "createBoundedPatch")
    .mockImplementation((options) => create({ ...options, timeoutMs: STEP_TIMEOUT_MS }));
  onTestFinished(() => patch.mockRestore());
}
