import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";

import { FileRepository } from "../src/storage/repository.ts";

// repository.test.ts passes these arguments.
const [cwd = "", agentDir = "", label = "", count = ""] = process.argv.slice(2);
const repository = await FileRepository.create({
  cwd,
  agentDir,
  retention: 250,
  // The test covers mutation preservation, not the deadline; a loaded suite can starve a waiter.
  lockTimeoutMs: STEP_TIMEOUT_MS
});

// Start mutating only when both workers are ready, so their lock attempts overlap.
const start = new Promise((resolve) => process.once("message", resolve));
process.send?.("ready");
await start;

for (let index = 0; index < Number(count); index++) {
  const result = await repository.mutate(
    "drafts",
    { kind: "add", text: `${label}-${index}`, recordedAt: "2026-01-01T00:00:00.000Z" },
    { signal: new AbortController().signal, atomic: (write) => write() }
  );

  if (result.status !== "committed")
    throw new Error(
      `Worker ${label} mutation ${index} failed: ${result.status === "failed" ? result.message : result.status}`
    );
}

process.disconnect?.();
