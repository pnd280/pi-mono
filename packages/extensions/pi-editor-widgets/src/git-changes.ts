import { statSync, watch, type FSWatcher } from "node:fs";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type LineCounts = { files: number; added: number; removed: number };

export type GitStats = { unstaged: LineCounts; staged: LineCounts; untracked: number };

const refreshDelayMs = 200;
const refreshTimeoutMs = 2000;

/** Sums `git diff --numstat` rows, which, unlike `--shortstat`, do not vary with the locale. */
function lineCounts(numstat: string): LineCounts {
  const counts = { files: 0, added: 0, removed: 0 };

  for (const row of numstat.split("\n")) {
    if (!row) continue;
    const [added, removed] = row.split("\t");
    counts.files++;
    // A binary file reports "-" for both counts.
    counts.added += Number(added) || 0;
    counts.removed += Number(removed) || 0;
  }

  return counts;
}

/**
 * Line counts of the repository that contains the session's working directory. Git runs only while the widget is placed, one process at a time, and never takes the index lock, so it cannot block a git command of the user or the agent.
 */
export class GitChanges {
  private stats: GitStats | undefined;
  private placed = false;
  private pending = false;
  private disposed = false;
  private timer: NodeJS.Timeout | undefined;
  private watcher: FSWatcher | undefined;
  private watched: string | undefined;
  private refreshing: AbortController | undefined;

  constructor(
    private readonly exec: ExtensionAPI["exec"],
    private readonly cwd: () => string,
    private readonly changed: () => void
  ) {}

  /** The last successful reading, kept during a refresh; `undefined` outside a repository and after a failure. */
  get current(): GitStats | undefined {
    return this.stats;
  }

  setPlaced(placed: boolean): void {
    if (placed === this.placed) return;
    this.placed = placed;
    if (placed) this.refresh();
    else this.stop();
  }

  /** Requests during the delay or a running refresh collapse into one later refresh. */
  refresh(): void {
    if (!this.placed || this.disposed) return;

    if (this.refreshing) {
      this.pending = true;

      return;
    }

    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.run();
    }, refreshDelayMs);
    this.timer.unref();
  }

  dispose(): void {
    this.disposed = true;
    this.placed = false;
    this.stop();
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = false;
    this.stats = undefined;
    this.unwatch();
    this.refreshing?.abort();
  }

  private unwatch(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.watched = undefined;
  }

  /** Staging and commits rewrite the index without any session activity. */
  private watch(gitDir: string): void {
    try {
      // A watch follows the directory it was opened on, so a replaced git directory needs a new one although its path is the same.
      const { dev, ino } = statSync(gitDir);
      const identity = `${dev}:${ino}:${gitDir}`;
      if (this.watched === identity) return;
      this.unwatch();
      // Git replaces the index by renaming a lock file, so a watch on the file itself would end at the first write.
      const watcher = watch(gitDir, (_event, file) => {
        if (file === null || file === "index") this.refresh();
      });
      watcher.on("error", () => {
        if (this.watcher === watcher) this.unwatch();
      });
      watcher.unref();
      this.watcher = watcher;
      this.watched = identity;
    } catch {
      this.unwatch();
      // Without a watch, the widget still refreshes on session activity.
    }
  }

  private async run(): Promise<void> {
    const refreshing = new AbortController();
    this.refreshing = refreshing;
    let next: GitStats | undefined;

    try {
      next = await this.read(
        AbortSignal.any([refreshing.signal, AbortSignal.timeout(refreshTimeoutMs)])
      );
    } catch {
      // A missing git, a failed command, and a timeout all show as no output.
    }

    this.refreshing = undefined;

    // A hidden widget aborts its refresh; its result predates a re-placement, which asks for a fresh read through `pending`.
    if (!refreshing.signal.aborted && JSON.stringify(next) !== JSON.stringify(this.stats)) {
      this.stats = next;
      this.changed();
    }

    if (this.pending) {
      this.pending = false;
      this.refresh();
    }
  }

  private async git(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    const result = await this.exec("git", ["--no-optional-locks", ...args], { cwd, signal });
    if (result.code !== 0 || result.killed) throw new Error("git failed");

    return result.stdout;
  }

  private async read(signal: AbortSignal): Promise<GitStats> {
    const cwd = this.cwd();
    // A linked worktree keeps its index in its own git directory, not in the shared one. The path is the whole output, because it can contain a newline itself.
    const gitDir = (await this.git(cwd, ["rev-parse", "--absolute-git-dir"], signal)).replace(
      /\n$/u,
      ""
    );
    // The widget can be removed or the session can end while git runs; neither may leave a watch behind.
    signal.throwIfAborted();
    this.watch(gitDir);
    // Without a path, a diff covers the whole repository from any directory, unless `diff.relative` is set.
    const diff = ["diff", "--numstat", "--no-relative"];
    const unstaged = lineCounts(await this.git(cwd, diff, signal));
    const staged = lineCounts(await this.git(cwd, [...diff, "--cached"], signal));
    // ls-files lists only the current directory unless it is given the top of the working tree.
    const untracked = await this.git(
      cwd,
      ["ls-files", "--others", "--exclude-standard", "-z", "--", ":/"],
      signal
    );

    return { unstaged, staged, untracked: untracked.split("\0").length - 1 };
  }
}
