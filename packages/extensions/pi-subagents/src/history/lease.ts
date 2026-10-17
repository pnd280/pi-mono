import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rmdir,
  unlink,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { renameWithRetry } from "@pi-mono/libs/file-rename";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function ignoreMissing(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

/** A new session file can be absent until Pi writes its first response. */
async function canonical(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;

    return join(await realpath(dirname(file)), basename(file));
  }
}

/**
 * A reused PID still counts as live; only a missing or exited process frees an entry. Signals
 * still reach an exited process until its parent reaps it, so Linux also checks for a zombie.
 */
async function alive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return !hasCode(error, "ESRCH");
  }

  if (process.platform !== "linux") return true;
  let stat: string;

  try {
    stat = await readFile(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    return !hasCode(error, "ENOENT") && !hasCode(error, "ESRCH");
  }

  // The state follows the command name, which can itself contain ") ".
  return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
}

const releasedKey = Symbol.for("pi-subagents.released-lease-entries");

/**
 * Entries that this process released but could not remove. They name this live process, so they
 * would otherwise block its next acquire. The set is process-owned because Pi reloads extension
 * modules.
 */
function releasedEntries(): Set<unknown> {
  const retained: unknown = Reflect.get(process, releasedKey);
  if (retained instanceof Set) return retained;
  const entries = new Set<unknown>();
  Reflect.set(process, releasedKey, entries);

  return entries;
}

function pids(text: string): number[] | undefined {
  const values = text.split(" ").map(Number);

  return values.length > 0 && values.every((pid) => Number.isSafeInteger(pid) && pid > 0)
    ? values
    : undefined;
}

/** A damaged entry excludes a writer without allowing an unbounded or blocking read. */
async function readEntry(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);

  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024) return undefined;
    const buffer = Buffer.alloc(1025);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return undefined;

    return {
      processes: pids(buffer.subarray(0, bytesRead).toString("utf8")),
      dev: stat.dev,
      ino: stat.ino
    };
  } finally {
    await handle.close();
  }
}

/** Removes an entry that this process released; a failed removal waits for the next acquire. */
async function removeReleased(path: string): Promise<void> {
  try {
    await ignoreMissing(unlink(path));
    releasedEntries().delete(path);
  } catch {
    /* The entry stays released. */
  }
}

/**
 * Cross-process exclusion for a child session writer. Each contender publishes an entry that
 * names its processes, then lists the others; two contenders cannot both hold the lease.
 */
export class WriterLease {
  private released = false;
  /** Entry writes and removal run in order, so a release cannot precede a pending write. */
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly directory: string,
    private readonly entry: string,
    private processes: number[]
  ) {}

  static async acquire(file: string, processes: number[]): Promise<WriterLease> {
    const directory = `${await canonical(file)}.lease`;
    const lease = new WriterLease(directory, join(directory, randomUUID()), processes);

    try {
      await lease.write();

      for (const name of await readdir(directory)) {
        const path = join(directory, name);
        if (name.startsWith(".") || path === lease.entry) continue;

        if (releasedEntries().has(path)) {
          await removeReleased(path);
          continue;
        }

        try {
          const holder = await readEntry(path);
          // Entries are published by rename, so an unreadable one is not a partial write.
          if (!holder?.processes || (await Promise.all(holder.processes.map(alive))).includes(true))
            throw new Error("Task is running in another process");
          // The supervisor can add its child after we open the old entry, then exit before the
          // liveness check. Only remove the inode we checked. Once its writers are dead, they
          // cannot replace it again.
          const current = await lstat(path);
          if (current.dev !== holder.dev || current.ino !== holder.ino)
            throw new Error("Task is running in another process");
          await ignoreMissing(unlink(path));
        } catch (error) {
          if (hasCode(error, "ENOENT")) continue;
          throw error;
        }
      }
    } catch (error) {
      await lease.release().catch(() => {});
      throw error;
    }

    return lease;
  }

  /** Add a process that writes the file, such as the spawned child. */
  add(pid: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.released) return;
      this.processes = [...this.processes, pid];
      await this.write();
    });
  }

  release(): Promise<void> {
    return this.enqueue(async () => {
      if (this.released) return;
      this.released = true;

      try {
        await ignoreMissing(unlink(this.entry));
      } catch (error) {
        releasedEntries().add(this.entry);
        throw error;
      }

      try {
        await rmdir(this.directory);
      } catch {
        /* Another contender's entry, or a stale one, keeps the directory. */
      }
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});

    return result;
  }

  private async write(): Promise<void> {
    const temporary = join(this.directory, `.${randomUUID()}`);

    // A releasing holder can remove the empty directory between these steps.
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, this.processes.join(" "), { flag: "wx", mode: 0o600 });
        // Windows refuses to replace a file while another process, such as a contender reading
        // it or a virus scanner, has it open. A final failure keeps the previous entry published.
        await renameWithRetry(temporary, this.entry);

        return;
      } catch (error) {
        await ignoreMissing(unlink(temporary));
        if (!hasCode(error, "ENOENT") || attempt >= 3) throw error;
      }
    }
  }
}
