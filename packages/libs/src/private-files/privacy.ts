import { spawn } from "node:child_process";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, realpath, stat, type FileHandle } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";

import { z } from "zod";

import { hasCode, PrivateFileError, ReadLimitError } from "./errors.ts";

const readLimitSchema = z.int().nonnegative().lt(Number.MAX_SAFE_INTEGER);

/**
 * Native Windows has no POSIX owner IDs. There, storage trusts the inherited ACL of the user
 * profile and skips owner and mode checks; see the [ADR](../../docs/adr/0001-windows-private-storage.md).
 */
export async function checkHandle(handle: FileHandle, directory = false): Promise<void> {
  const uid = process.getuid?.();
  const stat = await handle.stat();

  if (uid !== undefined && stat.uid !== uid)
    throw new PrivateFileError("Storage ownership is not private to the current user.");
  // An open descriptor may be unlinked by lock release or atomic replacement.
  // It is still private; only multiple links expose another path to the same file.
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1)
    throw new PrivateFileError(
      "Storage must use owned directories and regular, non-hard-linked files."
    );
  if (uid === undefined) return;
  await handle.chmod(directory ? 0o700 : 0o600);
  // POSIX chmod removes effective group/named-user ACL access via the ACL mask.
  // macOS extended ACLs are independent of mode bits and must be removed explicitly.
  if (process.platform === "darwin") await removeMacAcl(handle);
  const checked = await handle.stat();

  if ((checked.mode & 0o7777) !== (directory ? 0o700 : 0o600))
    throw new PrivateFileError("Filesystem cannot establish private storage permissions.");
}

function removeMacAcl(handle: FileHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    // Pass the already validated descriptor, not an independently reopened path.
    const child = spawn("/bin/chmod", ["-N", "/dev/fd/3"], {
      stdio: ["ignore", "ignore", "ignore", handle.fd]
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new PrivateFileError("ACL repair timed out."));
    }, 2000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new PrivateFileError("Cannot establish private ACL restrictions."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new PrivateFileError("Cannot establish private ACL restrictions."));
    });
  });
}

const outsideProfile = "On Windows, private storage must be inside the user profile.";

/**
 * Path text cannot prove containment on Windows: `relative` ignores case even in case-sensitive
 * NTFS folders, and libuv's lstat follows a mounted folder to another volume. So, from a real
 * path, each directory must stay on the profile's volume until one is the profile itself. lstat
 * keeps a junction that replaces a directory during the walk from matching the profile.
 */
async function withinProfile(real: string, profile: BigIntStats): Promise<boolean> {
  for (let current = real; ; current = dirname(current)) {
    const entry = await lstat(current, { bigint: true });

    if (entry.dev !== profile.dev) return false;
    if (entry.ino === profile.ino) return true;
    if (dirname(current) === current) return false;
  }
}

/**
 * The opened directory must be on the profile's volume and strictly below the profile. Its real
 * path is the final path of the directory, so a mounted folder resolves to its own volume. The
 * real path must still name the opened directory, so a replacement after the open is refused.
 */
async function checkProfileDirectory(
  handle: FileHandle,
  path: string,
  profile: BigIntStats
): Promise<void> {
  const real = await realpath(path);
  const [opened, resolved] = await Promise.all([
    handle.stat({ bigint: true }),
    lstat(real, { bigint: true })
  ]);

  if (
    opened.dev !== profile.dev ||
    opened.ino === profile.ino ||
    resolved.dev !== opened.dev ||
    resolved.ino !== opened.ino ||
    !(await withinProfile(dirname(real), profile))
  )
    throw new PrivateFileError(outsideProfile);
}

/**
 * Native Windows has no O_NOFOLLOW, so open follows a final-path link or junction. The opened
 * file must be the entry that lstat found; big integers keep 64-bit NTFS file IDs exact.
 */
async function checkEntry(handle: FileHandle, entry: BigIntStats): Promise<void> {
  const opened = await handle.stat({ bigint: true });

  if (opened.dev !== entry.dev || opened.ino !== entry.ino)
    throw new PrivateFileError("Storage path is a link or changed while opening; access refused.");
}

/**
 * Create or validate one owned directory, refusing a final-path symlink and
 * repairing permissions to 0700 with restricted ACL access. Its parent must
 * already exist and be trusted. Without POSIX owner IDs, the directory must be
 * below the user profile on its volume, and its permissions stay unchanged.
 */
export async function privateDirectory(path: string): Promise<void> {
  const profile =
    process.getuid === undefined ? await stat(homedir(), { bigint: true }) : undefined;
  // The parent may be the profile itself.
  if (profile && !(await withinProfile(await realpath(dirname(path)), profile)))
    throw new PrivateFileError(outsideProfile);

  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
  }

  const entry = profile ? await lstat(path, { bigint: true }) : undefined;
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );

  try {
    if (profile && entry) {
      await checkEntry(handle, entry);
      await checkProfileDirectory(handle, path, profile);
    }

    await checkHandle(handle, true);
  } finally {
    await handle.close();
  }
}

/**
 * Open an existing regular file under trusted parents and repair its permissions.
 * O_NOFOLLOW protects the final path only. The caller owns the returned handle
 * and must close it in finally, including after a read or validation failure.
 */
export async function privateOpen(path: string, flags = constants.O_RDONLY): Promise<FileHandle> {
  // Preflight avoids even opening devices; descriptor checks below remain authoritative.
  const entry = await lstat(path, { bigint: true });
  if (!entry.isFile() || entry.nlink !== 1n)
    throw new PrivateFileError(
      "Storage file is a symlink, hard link, or nonregular file; access refused."
    );
  const handle = await open(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);

  try {
    if (process.getuid === undefined) await checkEntry(handle, entry);
    await checkHandle(handle);

    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * Read bounded bytes under caller-established trusted parents. Reads can repair
 * permissions and ACLs. A missing path returns undefined; unsafe files and data
 * exceeding maxBytes throw. Raw OS errors may expose paths to callers.
 */
export async function boundedRead(path: string, maxBytes: number): Promise<Buffer | undefined> {
  if (!readLimitSchema.safeParse(maxBytes).success)
    throw new RangeError("Read limit must be a nonnegative safe integer below MAX_SAFE_INTEGER.");
  let handle: FileHandle;

  try {
    handle = await privateOpen(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }

  try {
    if ((await handle.stat()).size > maxBytes) throw new ReadLimitError();
    const chunks: Buffer[] = [];
    let total = 0;

    while (total <= maxBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);

      if (bytesRead === 0) return Buffer.concat(chunks, total);
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
    }

    throw new ReadLimitError();
  } finally {
    await handle.close();
  }
}

export async function sameFile(path: string, handle: FileHandle): Promise<boolean> {
  const [actual, owned] = await Promise.all([
    lstat(path, { bigint: true }),
    handle.stat({ bigint: true })
  ]);

  return !actual.isSymbolicLink() && actual.dev === owned.dev && actual.ino === owned.ino;
}
