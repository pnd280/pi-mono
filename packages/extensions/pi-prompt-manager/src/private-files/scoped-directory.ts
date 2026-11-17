import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { privateDirectory } from "./privacy.ts";

export type DirectoryScope = { path: string; key: string };

/** Aliases of one real directory share a storage key; distinct directories do not. */
export async function resolveDirectoryScope(directory: string): Promise<DirectoryScope> {
  const path = await realpath(directory);

  return { path, key: createHash("sha256").update(path).digest("hex") };
}

/** The trusted root may be a symlink; each owned child is created or checked without following one. */
export async function privateScopedDirectory(options: {
  root: string;
  namespace: string;
  key: string;
}): Promise<string> {
  const root = await realpath(options.root);
  const namespace = join(root, options.namespace);
  await privateDirectory(namespace);
  const directory = join(namespace, options.key);
  await privateDirectory(directory);

  return directory;
}
