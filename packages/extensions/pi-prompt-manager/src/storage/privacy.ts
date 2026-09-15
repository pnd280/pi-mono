import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

import { isRecord, limits, PromptError } from "../model.ts";
import { reductionGuidance } from "./codec.ts";

export function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

export async function checkHandle(handle: FileHandle, directory = false): Promise<void> {
  const stat = await handle.stat();

  if (process.getuid === undefined || stat.uid !== process.getuid())
    throw new PromptError("Storage ownership is not private to the current user.");
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
    throw new PromptError("Storage must use owned directories and regular, non-hard-linked files.");
  await handle.chmod(directory ? 0o700 : 0o600);
  // POSIX chmod removes effective group/named-user ACL access via the ACL mask.
  // macOS extended ACLs are independent of mode bits and must be removed explicitly.
  if (process.platform === "darwin") await removeMacAcl(handle);
  const checked = await handle.stat();

  if ((checked.mode & 0o7777) !== (directory ? 0o700 : 0o600))
    throw new PromptError("Filesystem cannot establish private storage permissions.");
}

function removeMacAcl(handle: FileHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    // Pass the already validated descriptor, not an independently reopened path.
    const child = spawn("/bin/chmod", ["-N", "/dev/fd/3"], {
      stdio: ["ignore", "ignore", "ignore", handle.fd]
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new PromptError("ACL repair timed out."));
    }, 2000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new PromptError("Cannot establish private ACL restrictions."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new PromptError("Cannot establish private ACL restrictions."));
    });
  });
}

async function privateDirectory(path: string): Promise<void> {
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

export async function collectionDirectory(agentDir: string, hash: string): Promise<string> {
  if (process.platform !== "linux" && process.platform !== "darwin")
    throw new PromptError("Prompt storage supports Linux, macOS, and WSL local filesystems only.");
  // The designated agent root may be a symlink. Everything we own below it may not.
  const root = await realpath(agentDir);
  const extension = join(root, "pi-prompt-manager");
  await privateDirectory(extension);
  const directory = join(extension, hash);
  await privateDirectory(directory);

  return directory;
}

export async function privateOpen(path: string, flags = constants.O_RDONLY): Promise<FileHandle> {
  // Preflight avoids even opening devices; descriptor checks below remain authoritative.
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new PromptError(
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

export async function boundedRead(path: string): Promise<Buffer | undefined> {
  let handle: FileHandle;

  try {
    handle = await privateOpen(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }

  try {
    if ((await handle.stat()).size > limits.read)
      throw new PromptError(`Collection exceeds the 64 MiB read bound. ${reductionGuidance}`);
    const chunks: Buffer[] = [];
    let total = 0;

    while (total <= limits.read) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limits.read + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);

      if (bytesRead === 0) return Buffer.concat(chunks, total);
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
    }

    throw new PromptError(`Collection exceeds the 64 MiB read bound. ${reductionGuidance}`);
  } finally {
    await handle.close();
  }
}

export async function sameFile(path: string, handle: FileHandle): Promise<boolean> {
  const [actual, owned] = await Promise.all([lstat(path), handle.stat()]);

  return !actual.isSymbolicLink() && actual.dev === owned.dev && actual.ino === owned.ino;
}
