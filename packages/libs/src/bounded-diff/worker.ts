import { parentPort } from "node:worker_threads";

import { createPatch, FILE_HEADERS_ONLY } from "diff";

import type { BoundedPatchOptions, BoundedPatchResult } from "./index.ts";

const port = parentPort;
if (!port) throw new Error("Patch generation requires a worker port.");

function generate(options: BoundedPatchOptions): BoundedPatchResult {
  // Identical sources need only headers, not line tokens or a diff search.
  const unchanged = options.before === options.after;
  const patch = createPatch(
    options.path,
    unchanged ? "" : options.before.replaceAll("\r\n", "\n"),
    unchanged ? "" : options.after.replaceAll("\r\n", "\n"),
    undefined,
    undefined,
    {
      context: options.contextLines,
      headerOptions: FILE_HEADERS_ONLY,
      maxEditLength: options.maxEditLength,
      timeout: options.timeoutMs
    }
  );
  if (patch === undefined) return { status: "budget-exceeded" };
  if (Buffer.byteLength(patch) > options.maxPatchBytes) return { status: "patch-too-large" };

  return { status: "ready", patch };
}

// Options are validated by the parent. Nothing here imports Pi or session state.
port.on("message", (options: BoundedPatchOptions) => {
  let result: BoundedPatchResult;

  try {
    result = generate(options);
  } catch {
    result = { status: "worker-failed" };
  }

  port.postMessage(result);
});
port.postMessage({ status: "online" });
