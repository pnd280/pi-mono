import { readdir, readFile, readlink } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";

export async function fixtureProcesses(
  directory: string
): Promise<{ pid: number; command: string }[]> {
  const found = await Promise.all(
    (await readdir("/proc"))
      .filter((name) => /^\d+$/.test(name))
      .map(async (name) => {
        try {
          const cwd = await readlink(`/proc/${name}/cwd`);
          if (!cwd.startsWith(`${directory}/`)) return [];
          const command = (await readFile(`/proc/${name}/cmdline`, "utf8"))
            .replaceAll("\0", " ")
            .trim();

          return [{ pid: Number(name), command }];
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            ["ENOENT", "ESRCH", "EACCES"].includes(String(error.code))
          )
            return [];
          throw error;
        }
      })
  );

  return found.flat();
}

/** The state, parent, and process group of a process, or undefined when no process has its PID. */
export async function processStat(
  pid: number
): Promise<{ state: string; ppid: number; pgrp: number } | undefined> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    // The command name in parentheses can contain spaces and parentheses.
    const [state = "", ppid, pgrp] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");

    return { state, ppid: Number(ppid), pgrp: Number(pgrp) };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ENOENT", "ESRCH"].includes(String(error.code))
    )
      return undefined;
    throw error;
  }
}

export async function remainingProcesses(directory: string, timeout = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let remaining = await fixtureProcesses(directory);

  while (remaining.length > 0 && Date.now() < deadline) {
    await setTimeout(25);
    remaining = await fixtureProcesses(directory);
  }

  return remaining;
}

/** Failure cleanup only. Assertions inspect the leaked list before using this fallback. */
export async function killFixtureProcesses(directory: string): Promise<void> {
  for (const { pid } of await fixtureProcesses(directory)) {
    // A process is a group leader only when it started the group, and its PID then names it.
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
    }
  }

  await remainingProcesses(directory);
}
