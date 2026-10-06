import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { join } from "node:path";

import { KILL_GRACE_MS } from "./constants.ts";

export function processOptions(): Pick<SpawnOptions, "detached" | "windowsHide"> {
  return process.platform === "win32" ? { detached: false, windowsHide: true } : { detached: true };
}

export function isAlive(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    // Exit can race the timer. Other errors must reach the run's diagnostics.
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

/** Freeze the live owned tree before discovery, including separately detached descendants. */
export function terminateTree(
  child: ChildProcess,
  report: (step: string) => void,
  onError: (error: Error) => void
): void {
  const root = child.pid;
  if (root === undefined || !isAlive(child)) return;

  if (process.platform === "win32") {
    forceStop(child, report, onError);

    return;
  }

  const owned = new Set([root]);
  const groups = new Set([root]);

  try {
    // A stopped parent cannot spawn another child while its descendants are discovered.
    signalProcess(-root, "SIGSTOP");
    let added: boolean;

    do {
      added = false;
      const processes = execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], {
        encoding: "utf8"
      });

      for (const line of processes.trim().split("\n")) {
        const [pid, parent, group] = line.trim().split(/\s+/).map(Number);
        if (
          pid === undefined ||
          parent === undefined ||
          group === undefined ||
          !owned.has(parent) ||
          owned.has(pid)
        )
          continue;
        signalProcess(pid, "SIGSTOP");
        owned.add(pid);
        if (pid === group) groups.add(group);
        added = true;
      }
    } while (added);
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  } finally {
    report("SIGKILL");

    // Kill descendants first. All targets came from this live handle, never saved records.
    for (const pid of [...owned].reverse()) {
      try {
        if (groups.has(pid)) signalProcess(-pid, "SIGKILL");
        signalProcess(pid, "SIGKILL");
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

/** Begin the platform's forced stop; the caller already waited the stdin grace period. */
export function forceStop(
  child: ChildProcess,
  report: (step: string) => void,
  onError: (error: Error) => void
): () => void {
  const pid = child.pid;

  if (pid === undefined || !isAlive(child)) return () => {};

  if (process.platform === "win32") {
    report("taskkill");
    const killer = spawn(
      join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
      ["/F", "/T", "/PID", String(pid)],
      { stdio: "ignore", windowsHide: true }
    );
    killer.once("error", onError);
    killer.once("exit", (code) => {
      if (code !== 0 && isAlive(child)) onError(new Error(`taskkill exited with code ${code}`));
    });

    return () => {};
  }

  const send = (signal: NodeJS.Signals) => {
    if (!isAlive(child)) return;
    report(signal);

    try {
      signalProcess(-pid, signal);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  send("SIGTERM");
  const timer = setTimeout(() => send("SIGKILL"), KILL_GRACE_MS);

  return () => clearTimeout(timer);
}
