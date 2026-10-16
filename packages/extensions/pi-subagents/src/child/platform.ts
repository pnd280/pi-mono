import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { KILL_GRACE_MS } from "../constants.ts";

/**
 * The interval of process-group checks. Each signal follows a check that found the group; PIDs are
 * allocated in sequence, so its PGID is reused within one interval only after the PID space wraps.
 */
const GROUP_CHECK_MS = 50;

/** How long a group can remain after SIGKILL, such as zombies that their new parent reaps. */
const KILL_CHECK_MS = 1_000;

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
export function terminateTree(child: ChildProcess, onError: (error: Error) => void): void {
  const root = child.pid;
  if (root === undefined || !isAlive(child)) return;

  if (process.platform === "win32") {
    void forceStop(child, onError);

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

/**
 * Begin the platform's forced stop; the caller already waited the stdin grace period. It resolves
 * when the stop ends: on Linux and macOS, when the child's process group is gone or its failure was
 * reported, also after the child itself exited.
 */
export function forceStop(child: ChildProcess, onError: (error: Error) => void): Promise<void> {
  const pid = child.pid;

  if (pid === undefined || !isAlive(child)) return Promise.resolve();

  if (process.platform === "win32") {
    const killer = spawn(
      join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
      ["/F", "/T", "/PID", String(pid)],
      { stdio: "ignore", windowsHide: true }
    );

    return new Promise((resolve) => {
      killer.once("error", (error) => {
        onError(error);
        resolve();
      });
      killer.once("exit", (code) => {
        if (code !== 0 && isAlive(child)) onError(new Error(`taskkill exited with code ${code}`));
        resolve();
      });
    });
  }

  // The live child holds its PID, so the first signal reaches its own group.
  return stopGroup(pid).catch((error: unknown) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  });
}

/**
 * After the child's exit, the forced stop of the members that remain in its process group, such as a
 * process that holds the child's output pipes. It is undefined when the group is gone, and on
 * Windows, where the child has no process group.
 */
export function stopRemainingGroup(
  child: ChildProcess,
  onError: (error: Error) => void
): Promise<void> | undefined {
  const pid = child.pid;
  if (pid === undefined || process.platform === "win32") return undefined;

  try {
    // An answer proves only that a group with this PGID exists. After the child is reaped, only the
    // remaining members keep the number, so a reused PGID can belong to another group.
    if (signalGroup(pid, 0) === "gone") return undefined;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));

    return undefined;
  }

  return stopGroup(pid).catch((error: unknown) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  });
}

/**
 * Signal a process group. ESRCH means that it has no member left, so its PGID can be reused.
 * macOS also reports EPERM for a group that has only zombies, so EPERM does not prove a stop.
 */
function signalGroup(pgid: number, signal: NodeJS.Signals | 0): "sent" | "gone" | "denied" {
  try {
    process.kill(-pgid, signal);

    return "sent";
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ESRCH") return "gone";
    if (code === "EPERM") return "denied";
    throw error;
  }
}

/** SIGTERM, then SIGKILL after the grace period, until the group is gone. It never signals a gone group. */
async function stopGroup(pgid: number): Promise<void> {
  let state = signalGroup(pgid, "SIGTERM");
  const kill = Date.now() + KILL_GRACE_MS;

  while (state !== "gone" && Date.now() < kill) {
    await setTimeout(GROUP_CHECK_MS);
    state = signalGroup(pgid, 0);
  }

  if (state !== "gone") state = signalGroup(pgid, "SIGKILL");
  const end = Date.now() + KILL_CHECK_MS;

  while (state !== "gone" && Date.now() < end) {
    await setTimeout(GROUP_CHECK_MS);
    state = signalGroup(pgid, 0);
  }

  if (state === "sent") throw new Error(`Process group ${pgid} still has members after SIGKILL`);
  if (state === "denied")
    throw new Error(`Process group ${pgid} cannot be checked after SIGKILL (EPERM)`);
}
