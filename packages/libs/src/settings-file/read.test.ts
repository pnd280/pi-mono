import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { STEP_TIMEOUT_MS } from "../validation/pi-process/index.ts";

it.skipIf(process.platform === "win32")(
  "rejects a configured FIFO without blocking the startup reader",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "settings-file-fifo-"));

    try {
      const fifo = join(directory, "settings.json");
      execFileSync("mkfifo", [fifo], { timeout: STEP_TIMEOUT_MS });

      // Isolate the synchronous startup reader so a blocking open cannot hang the runner.
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
          import { readSettingsFile } from ${JSON.stringify(new URL("./read.ts", import.meta.url).href)};
          process.stdout.write(JSON.stringify({ value: readSettingsFile(${JSON.stringify(fifo)}) ?? null }));
        `
        ],
        { encoding: "utf8", timeout: STEP_TIMEOUT_MS }
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ value: null });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
