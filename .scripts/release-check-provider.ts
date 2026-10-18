// Offline model for the release check in build-release.ts, so that a Pi run with every release
// extension can finish without credentials or network access. Its reply is "ok" only when both
// worker threads start and answer in the installed tree. Node loads worker files itself, without
// Pi's loader and its host packages, and Pi's print mode never starts them otherwise.
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const callable = z.custom<(options: object) => Promise<unknown>>(
  (value) => typeof value === "function"
);
const boundedDiff = z.object({ createBoundedPatch: callable });
const collectionProcessing = z.object({ readCollectionAsync: callable });
const ready = z.object({ status: z.literal("ready") });

async function probe(name: string, run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    const result = await run();

    return ready.safeParse(result).success ? undefined : `${name}: ${JSON.stringify(result)}`;
  } catch (error) {
    return `${name}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function probeWorkers(tree: string): Promise<string> {
  const failures = await Promise.all([
    probe("bounded-diff worker", async () => {
      const { createBoundedPatch } = boundedDiff.parse(
        await import(join(tree, "lib/libs/src/bounded-diff/index.ts"))
      );

      return createBoundedPatch({
        path: "probe.txt",
        before: "before\n",
        after: "after\n",
        maxSourceBytes: 1024,
        maxPatchBytes: 1024,
        maxEditLength: 16,
        contextLines: 3,
        timeoutMs: 5000
      });
    }),
    probe("pi-prompt-manager collection worker", async () => {
      const { readCollectionAsync } = collectionProcessing.parse(
        await import(join(tree, "extensions/pi-prompt-manager/src/storage/processing.ts"))
      );
      // The empty document that readCollection returns for a missing file, padded past
      // `workerThreshold` (1 MiB) in processing.ts, so that the worker reads it.
      const cwd = "/release-check";
      const document = JSON.stringify({ version: 1, cwd, entries: [] });

      return readCollectionAsync({
        collection: "history",
        cwd,
        raw: Buffer.from(document.padEnd(2 * 1024 * 1024))
      });
    })
  ]);
  const messages = failures.filter((failure) => failure !== undefined);

  return messages.length > 0 ? messages.join("\n") : "ok";
}

export default function releaseCheckProvider(pi: ExtensionAPI) {
  const faux = fauxProvider({ provider: "release-check", models: [{ id: "model" }] });
  // build-release.ts starts Pi in the installed copy of the release tree.
  const tree = process.cwd();
  faux.setResponses([async () => fauxAssistantMessage(await probeWorkers(tree))]);
  pi.registerProvider(faux.provider);
}
