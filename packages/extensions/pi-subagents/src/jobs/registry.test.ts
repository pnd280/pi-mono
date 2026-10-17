import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { ExtensionToolContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { createPiLaunch, STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { createToolContext } from "@pi-mono/libs/validation/tool-context";
import { expect, test, vi } from "vite-plus/test";

import { killFixtureProcesses, processStat } from "../../validation/processes.ts";
import { createFixtureWorkspace } from "../../validation/workspace.ts";
import { JobLog } from "./log-writer.ts";
import { Jobs } from "./registry.ts";

async function withJobs(
  body: (jobs: Jobs, ctx: ExtensionToolContext, cwd: string) => Promise<void>
): Promise<void> {
  const directory = await createFixtureWorkspace();
  let jobs: Jobs | undefined;

  try {
    const launch = await createPiLaunch({ directory, args: [] });
    for (const key of Object.keys(process.env)) vi.stubEnv(key, undefined);
    for (const [key, value] of Object.entries(launch.options.env)) vi.stubEnv(key, value);
    const { cwd } = launch.options;
    const entries: SessionEntry[] = [];
    jobs = new Jobs(entries, {
      cwd,
      sessionId: randomUUID(),
      branch: () => entries,
      append: (customType, data) => {
        entries.push({
          type: "custom",
          id: randomUUID(),
          parentId: entries.at(-1)?.id ?? null,
          timestamp: new Date().toISOString(),
          customType,
          data
        });
      }
    });
    await body(jobs, await createToolContext(cwd), cwd);
  } finally {
    try {
      // Failure cleanup must also stop processes leaked by the old runner in the red check.
      await killFixtureProcesses(directory);
      await jobs?.shutdown();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      // The isolated TMPDIR puts every job log inside this fixture directory.
      await rm(directory, { recursive: true, force: true });
    }
  }
}

test.skipIf(process.platform !== "linux")(
  "fails explicitly before stalled log writes exceed 16 MiB",
  async () => {
    await withJobs(async (jobs, ctx, cwd) => {
      let writer: JobLog | undefined;
      let release: (() => void) | undefined;
      let pendingAtStop = 0;
      const destruction = vi.spyOn(JobLog.prototype, "_destroy");
      vi.spyOn(JobLog.prototype, "_write").mockImplementation(function (
        this: JobLog,
        _chunk,
        _encoding,
        callback
      ) {
        writer = this;
        release = () => callback();
      });
      destruction.mockImplementation(function (this: JobLog, error, callback) {
        pendingAtStop = this.writableLength;
        destruction.mockRestore();
        this._destroy(error, callback);
      });

      try {
        const job = await jobs.start(
          {
            description: "Check stalled job log",
            command: "head -c 33554432 /dev/zero; echo done > produced; sleep 600"
          },
          ctx
        );
        await expect
          .poll(
            async () =>
              writer?.destroyed ||
              (await readFile(join(cwd, "produced"), "utf8").catch(() => "")) === "done\n",
            {
              timeout: STEP_TIMEOUT_MS
            }
          )
          .toBe(true);
        const pending = Math.max(pendingAtStop, writer?.writableLength ?? 0);
        expect(pending).toBeGreaterThan(0);
        expect(pending).toBeLessThanOrEqual(16 * 1024 * 1024);
        await expect
          .poll(() => jobs.owned(job.job_id), { timeout: STEP_TIMEOUT_MS })
          .toMatchObject({
            state: "inactive",
            outcome: "failed",
            error: "Log file write failed: Pending log output exceeded 16 MiB"
          });
      } finally {
        release?.();
      }
    });
  }
);

test.skipIf(process.platform !== "linux").each(["shell exit", "shutdown"])(
  "keeps group ownership through %s, including a background process that ignores SIGTERM",
  async (action) => {
    await withJobs(async (jobs, ctx, cwd) => {
      const job = await jobs.start(
        {
          description: "Check job group cleanup",
          command: [
            "sh -c 'trap \"\" TERM; echo $$ > member; exec sleep 600' >/dev/null 2>&1 &",
            "while [ ! -s member ]; do sleep 0.01; done",
            "echo $$ > shell",
            ...(action === "shutdown" ? ["wait"] : [])
          ].join("\n")
        },
        ctx
      );
      await expect
        .poll(() => readFile(join(cwd, "shell"), "utf8").catch(() => ""), {
          timeout: STEP_TIMEOUT_MS
        })
        .not.toBe("");
      const shell = Number(await readFile(join(cwd, "shell"), "utf8"));
      const member = Number(await readFile(join(cwd, "member"), "utf8"));

      if (action === "shutdown") await jobs.shutdown();
      else {
        await expect
          .poll(() => jobs.owned(job.job_id).state, { timeout: STEP_TIMEOUT_MS })
          .toBe("inactive");
        expect(jobs.owned(job.job_id)).toMatchObject({ outcome: "completed", exit_code: 0 });
      }

      expect(await processStat(member)).toBeUndefined();
      expect(await processStat(shell)).toBeUndefined();
      await jobs.shutdown();
      expect(await processStat(member)).toBeUndefined();
    });
  }
);
