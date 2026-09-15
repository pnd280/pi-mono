import { mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { privateScopedDirectory, resolveDirectoryScope } from "./scoped-directory.ts";

it("shares scopes across directory aliases and confines private children beneath a trusted root", async () => {
  const root = await mkdtemp(join(tmpdir(), "scoped-directory-"));

  try {
    const cwd = join(root, "work"),
      other = join(root, "other"),
      alias = join(root, "alias");
    await mkdir(cwd);
    await mkdir(other);
    await symlink(cwd, alias);
    const scope = await resolveDirectoryScope(cwd);
    expect(await resolveDirectoryScope(alias)).toEqual(scope);
    expect((await resolveDirectoryScope(other)).key).not.toBe(scope.key);
    const rootAlias = join(root, "root-alias");
    await symlink(root, rootAlias);
    const options = { root: rootAlias, namespace: "extension", key: scope.key };
    const directory = await privateScopedDirectory(options);
    expect(directory).toBe(join(root, "extension", scope.key));
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    for (const key of ["", ".", "..", "../escape", "a/b", "a\\b"])
      await expect(privateScopedDirectory({ ...options, key })).rejects.toThrow(TypeError);
    await rm(directory, { recursive: true });
    await symlink(cwd, directory);
    await expect(privateScopedDirectory(options)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
