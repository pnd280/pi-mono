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
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }

  await remainingProcesses(directory);
}
