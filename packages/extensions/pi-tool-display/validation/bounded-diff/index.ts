import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { onTestFinished, vi } from "vite-plus/test";

import * as boundedDiff from "../../src/bounded-diff/index.ts";

/**
 * For the rest of the current test, give every bounded patch the step deadline instead of its caller's time budget. The budget is wall-clock time that suite load can exceed. Use this only in a test whose assertion needs a generated patch, and run the code under test in the test process: a spawned Pi process keeps its callers' budgets.
 */
export function useStepPatchDeadline(): void {
  const create = boundedDiff.createBoundedPatch;
  const patch = vi
    .spyOn(boundedDiff, "createBoundedPatch")
    .mockImplementation((options) => create({ ...options, timeoutMs: STEP_TIMEOUT_MS }));
  onTestFinished(() => patch.mockRestore());
}
