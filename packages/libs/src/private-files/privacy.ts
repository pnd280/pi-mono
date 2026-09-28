import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, type FileHandle } from "node:fs/promises";

import { z } from "zod";

import { hasCode, PrivateFileError, ReadLimitError } from "./errors.ts";

const readLimitSchema = z.int().nonnegative().lt(Number.MAX_SAFE_INTEGER);

export async function checkHandle(handle: FileHandle, directory = false): Promise<void> {
  const stat = await handle.stat();

  if (process.getuid === undefined || stat.uid !== process.getuid())
    throw new PrivateFileError("Storage ownership is not private to the current user.");
  // An open descriptor may be unlinked by lock release or atomic replacement.
  // It is still private; only multiple links expose another path to the same file.
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1)
    throw new PrivateFileError(
      "Storage must use owned directories and regular, non-hard-linked files."
    );
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

/**
 * Create or validate one owned directory, refusing a final-path symlink and
 * repairing permissions to 0700 with restricted ACL access. Its parent must
 * already exist and be trusted.
 */
export async function privateDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
  }

  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );

  try {
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
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new PrivateFileError(
      "Storage file is a symlink, hard link, or nonregular file; access refused."
    );
  const handle = await open(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);

  try {
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
  const [actual, owned] = await Promise.all([lstat(path), handle.stat()]);

  return !actual.isSymbolicLink() && actual.dev === owned.dev && actual.ino === owned.ino;
}
