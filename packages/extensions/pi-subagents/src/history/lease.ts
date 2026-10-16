import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
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

function pids(text: string): number[] | undefined {
  const values = text.split(" ").map(Number);

  return values.length > 0 && values.every((pid) => Number.isSafeInteger(pid) && pid > 0)
    ? values
    : undefined;
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
        let text: string;

        try {
          text = await readFile(path, "utf8");
        } catch (error) {
          if (hasCode(error, "ENOENT")) continue;
          throw error;
        }

        // Entries are published by rename, so an unreadable one is not a partial write.
        const holder = pids(text);
        if (!holder || (await Promise.all(holder.map(alive))).includes(true))
          throw new Error("Task is running in another process");
        await ignoreMissing(unlink(path));
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
      await ignoreMissing(unlink(this.entry));

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
