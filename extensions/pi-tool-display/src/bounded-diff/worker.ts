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

// Nothing here imports Pi or session state. A throw reaches the parent as a worker error.
port.on("message", (options: BoundedPatchOptions) => port.postMessage(generate(options)));
port.postMessage({ status: "online" });
