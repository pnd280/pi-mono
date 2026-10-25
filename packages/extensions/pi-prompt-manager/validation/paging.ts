import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveDirectoryScope } from "../src/private-files/index.ts";

/** Initialize only new isolated fixtures, before any Pi process can access them. */
export async function seedPagingCollections(directory: string): Promise<void> {
  const { path: cwd, key: hash } = await resolveDirectoryScope(join(directory, "work"));
  const namespace = join(directory, "agent", "pi-prompt-manager");
  await mkdir(namespace, { mode: 0o700 });
  const storage = join(namespace, hash);
  await mkdir(storage, { mode: 0o700 });

  for (const collection of ["history", "drafts"] as const) {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      id: randomUUID(),
      text:
        `Paging ${collection} ${index + 1}\n` +
        Array.from(
          { length: 80 },
          (_, line) => `Prompt ${index + 1} preview line ${line + 1}`
        ).join("\n"),
      recordedAt: new Date(Date.now() - index * 60_000).toISOString()
    }));
    await writeFile(
      join(storage, `${collection}.json`),
      JSON.stringify({ version: 1, cwd, entries }),
      { mode: 0o600, flag: "wx" }
    );
  }
}

export const pagingTranscript = Array.from(
  { length: 100 },
  (_, index) => `Transcript line ${index + 1}`
).join("\n");
