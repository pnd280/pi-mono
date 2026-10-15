import { rm } from "node:fs/promises";

import { COMPILE_CACHES_ENV, createCompileCaches } from "./index.ts";

/** Vitest global setup: the run's validation workspaces share one compile-cache directory. */
export default async function setup(): Promise<() => Promise<void>> {
  const directory = await createCompileCaches();
  // Vitest copies this environment into workers after global setup.
  process.env[COMPILE_CACHES_ENV] = directory;

  return async () => {
    delete process.env[COMPILE_CACHES_ENV];
    await rm(directory, { recursive: true, force: true });
  };
}
