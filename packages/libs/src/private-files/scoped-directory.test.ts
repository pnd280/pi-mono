import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it, vi } from "vite-plus/test";

import { STEP_TIMEOUT_MS } from "../validation/pi-process/index.ts";
import { PrivateFileError } from "./errors.ts";
import { WriteLifetime } from "./lifetime.ts";
import { boundedRead } from "./privacy.ts";
import { privateScopedDirectory, resolveDirectoryScope } from "./scoped-directory.ts";
import { PrivateFileTransactions } from "./transaction.ts";

// Native Windows has no owner IDs; elsewhere this simulates it.
it("without owner IDs, stores only inside the user profile and keeps its permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "scoped-directory-profile-"));
  const getuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const posix = process.platform !== "win32";

  try {
    const profile = join(root, "profile");
    // A shared name prefix is still outside the profile.
    const outside = `${profile}-other`;
    const agent = join(profile, "agent");
    await mkdir(agent, { recursive: true });
    await mkdir(outside);
    await symlink(outside, join(profile, "link"), "junction");
    await symlink(outside, join(agent, "escape"), "junction");
    vi.stubEnv("HOME", profile);
    vi.stubEnv("USERPROFILE", profile);
    Object.defineProperty(process, "getuid", { value: undefined, configurable: true });

    for (const storage of [outside, join(profile, "link")])
      await expect(
        privateScopedDirectory({ root: storage, namespace: "extension", key: "scope" })
      ).rejects.toThrow(
        new PrivateFileError("On Windows, private storage must be inside the user profile.")
      );
    // A final directory that links outside is refused, as a link, before its key is created.
    await expect(
      privateScopedDirectory({ root: agent, namespace: "escape", key: "scope" })
    ).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);

    const namespace = join(agent, "extension");
    await mkdir(namespace, { recursive: true });
    await chmod(namespace, 0o755);
    const directory = await privateScopedDirectory({
      root: agent,
      namespace: "extension",
      key: "scope"
    });
    const path = join(directory, "data");
    await writeFile(path, "old");
    await chmod(path, 0o644);
    expect((await boundedRead(path, 100))?.toString()).toBe("old");

    if (posix) {
      expect((await stat(namespace)).mode & 0o777).toBe(0o755);
      expect((await stat(path)).mode & 0o777).toBe(0o644);
    }

    const scope = new WriteLifetime();
    const result = await new PrivateFileTransactions().run("data", {
      path: async () => path,
      scope,
      maxReadBytes: 100,
      timeoutMs: STEP_TIMEOUT_MS,
      update: (raw) => ({ status: "replace", content: "new", value: raw?.toString() })
    });
    await scope.dispose();
    expect(result).toMatchObject({ status: "committed", value: "old", warnings: [] });
    expect((await boundedRead(path, 100))?.toString()).toBe("new");
  } finally {
    if (getuid) Object.defineProperty(process, "getuid", getuid);
    else delete (process as { getuid?: unknown }).getuid;
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

// This test checks POSIX modes and file symlinks, which native Windows lacks or restricts.
it.runIf(process.platform !== "win32")(
  "shares scopes across directory aliases and confines private children beneath a trusted root",
  async () => {
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
      // macOS temporary paths are aliases: /var resolves to /private/var.
      expect(directory).toBe(join(await realpath(root), "extension", scope.key));
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      for (const key of ["", ".", "..", "../escape", "a/b", "a\\b"])
        await expect(privateScopedDirectory({ ...options, key })).rejects.toThrow(TypeError);
      await rm(directory, { recursive: true });
      await symlink(cwd, directory);
      await expect(privateScopedDirectory(options)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
