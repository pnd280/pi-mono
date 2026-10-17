import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { contentText } from "@earendil-works/pi-ai";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import type { RpcRecord } from "../src/child/connection.ts";
import { JOB_END_ENTRY, JOB_RESULT_MESSAGE, TASKS_MESSAGE } from "../src/constants.ts";
import { jobDetailsSchema } from "../src/jobs/records.ts";
import { detailsSchema } from "../src/result.ts";
import { release, replies, withFixture } from "./background-fixture.ts";
import { killFixtureProcesses, processStat, remainingProcesses } from "./processes.ts";
import type { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

const JOBS = { "ext.pi-subagents": { jobs: true } };

/** A fixture with jobs on, unless `options` sets other settings. */
function withJobs(
  body: Parameters<typeof withFixture>[0],
  options: Parameters<typeof withFixture>[1] = {}
): Promise<void> {
  return withFixture(body, { settings: JOBS, ...options });
}

const jobItemSchema = z.object({
  job_id: z.string(),
  state: z.enum(["active", "inactive"]),
  outcome: z.string().nullable(),
  exit_code: z.number().nullable()
});

async function jobList(host: Supervisor) {
  return z
    .object({ jobs: z.array(jobItemSchema) })
    .parse(JSON.parse((await host.command("jobs")).message)).jobs;
}

async function toolResults(host: Supervisor, tool: "job" | "job_abort") {
  return (await host.entries()).flatMap((entry) =>
    entry.type === "message" &&
    entry.message.role === "toolResult" &&
    entry.message.toolName === tool
      ? [entry.message]
      : []
  );
}

async function startedJob(host: Supervisor) {
  return jobDetailsSchema.parse((await toolResults(host, "job")).at(-1)?.details);
}

function isJobResult(record: RpcRecord): boolean {
  return (
    record.type === "message_end" &&
    record.message.role === "custom" &&
    record.message.customType === JOB_RESULT_MESSAGE
  );
}

function isToolResult(tool: string): (record: RpcRecord) => boolean {
  return (record) =>
    record.type === "message_end" &&
    record.message.role === "toolResult" &&
    record.message.toolName === tool;
}

function isJobEnd(record: RpcRecord): boolean {
  return (
    record.type === "entry_appended" &&
    record.entry.type === "custom" &&
    record.entry.customType === JOB_END_ENTRY
  );
}

/** Waits for a job result after `after`, then for the end of the run that it joined or started. */
async function settledAfterJobResult(host: Supervisor, after: number) {
  const result = await host.wait(isJobResult, after);
  await host.wait((record) => record.type === "agent_settled", host.records.indexOf(result));

  return result;
}

/** The process group of the `group` fixture job, which holds its shell and two sleeps. */
async function jobGroup(directory: string): Promise<number> {
  for (let index = 0; index < STEP_TIMEOUT_MS / 25; index++) {
    const text = (
      await readFile(join(directory, "work", "job-group"), "utf8").catch(() => "")
    ).trim();
    if (text) return Number(text);
    await setTimeout(25);
  }

  throw new Error("The job did not start");
}

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0);

    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

/** Checked before `Supervisor.stop()`, which can force-kill the supervisor and hide a leak. */
async function groupGone(group: number): Promise<boolean> {
  for (let index = 0; index < STEP_TIMEOUT_MS / 25 && groupAlive(group); index++)
    await setTimeout(25);

  return !groupAlive(group);
}

describe.skipIf(process.platform !== "linux").concurrent("background jobs", () => {
  test("J1: settles while a job runs, delivers its result once when idle, and keeps its ID after compaction", async () => {
    await withJobs(async (directory, start) => {
      const host = await start();
      // The run settles without a hold while the job waits for its barrier.
      await host.prompt("job-barrier");
      const job = await startedJob(host);
      expect(await jobList(host)).toMatchObject([{ job_id: job.job_id, state: "active" }]);
      const after = host.records.length;
      await release(directory, "job-release");
      await settledAfterJobResult(host, after);
      await host.wait(replies("Idle continuation prepared: true"), after);
      const results = await host.jobResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.details).toMatchObject({
        job_id: job.job_id,
        state: "inactive",
        outcome: "completed",
        exit_code: 0
      });
      expect(contentText(results[0]?.content ?? "")).toContain("Fixture job output");

      await host.request({ type: "compact" });
      const reminder = (await host.entries())
        .filter((entry) => entry.type === "custom_message" && entry.customType === TASKS_MESSAGE)
        .at(-1);
      const element = (
        reminder?.type === "custom_message" ? contentText(reminder.content) : ""
      ).match(new RegExp(`<job [^>]*id="${job.job_id}"[^>]*>`))?.[0];
      expect(element).toContain('state="inactive"');
      expect(element).toContain('outcome="completed"');
      await host.prompt("report-context");
      const text = await host.request({ type: "get_last_assistant_text" });
      expect(text.command === "get_last_assistant_text" ? text.data.text : "").toContain(
        job.job_id
      );
    });
  });

  test.each(["busy", "settling after an abort"])(
    "J1: delivers one job result while %s",
    async (mode) => {
      await withJobs(async (directory, start) => {
        const host = await start();
        const after = host.records.length;
        // The job ends while the scripted model holds the run.
        const work = host.prompt("job-fast-hold").catch((error: unknown) => error);
        await host.wait(isJobEnd, after);
        if (mode === "busy") await release(directory, "run-release");
        else await host.request({ type: "abort" });
        await work;

        if (mode === "busy") {
          const records = host.records.slice(after);
          // The result continues the same run.
          expect(records.filter((record) => record.type === "agent_settled")).toHaveLength(1);
          expect(records.findIndex(replies("background results 1"))).toBeGreaterThan(
            records.findIndex(isJobResult)
          );
        } else {
          await settledAfterJobResult(host, after);
          await host.wait(replies("Idle continuation prepared: true"), after);
        }

        expect(await host.jobResults()).toHaveLength(1);
      });
    }
  );

  test.each(["turn_end", "settle"] as const)(
    "J1: with resultDelivery %s, delivers a job result that arrives during a tool turn once in the same run",
    async (resultDelivery) => {
      await withJobs(
        async (directory, start) => {
          const host = await start();
          const after = host.records.length;
          const work = host.prompt("job-turn");
          // Pi emits the RPC turn_end after the turn_end handlers, so the job ends in the next turn.
          const started = await host.wait(isToolResult("job"), after);
          await host.wait((record) => record.type === "turn_end", host.records.indexOf(started));
          await release(directory, "job-release");
          // The model holds its second tool turn until the job has ended.
          await host.wait(isJobEnd, after);
          await release(directory, "run-release");
          await work;

          const records = host.records.slice(after);
          const read = records.findIndex(isToolResult("read"));
          const result = records.findIndex(isJobResult);
          const early = records.findIndex(replies("background results 0"));
          expect(read).toBeGreaterThan(-1);
          expect(result).toBeGreaterThan(read);
          expect(records.filter(isJobResult)).toHaveLength(1);

          if (resultDelivery === "turn_end") {
            // The request after the tool turn already contains the result.
            expect(early).toBe(-1);
          } else {
            // The result waits for the final reply.
            expect(early).toBeGreaterThan(read);
            expect(early).toBeLessThan(result);
          }

          expect(records.findIndex(replies("background results 1"))).toBeGreaterThan(result);
          expect(records.filter((record) => record.type === "agent_settled")).toHaveLength(1);
          expect(await host.jobResults()).toHaveLength(1);
        },
        { settings: { "ext.pi-subagents": { jobs: true, resultDelivery } } }
      );
    }
  );

  test("J1: delivers a timed-out job as failed even after an abort during group cleanup", async () => {
    await withJobs(async (directory, start) => {
      const host = await start();
      const after = host.records.length;
      await host.prompt("job-timeout");
      const job = await startedJob(host);
      const group = await jobGroup(directory);
      await expect.poll(() => processStat(group), { timeout: STEP_TIMEOUT_MS }).toBeUndefined();
      expect(groupAlive(group)).toBe(true);
      await host.prompt(`job-abort-id ${job.job_id}`);
      expect(
        jobDetailsSchema.parse((await toolResults(host, "job_abort")).at(-1)?.details)
      ).toMatchObject({ outcome: "failed", error: "timed out after 1 s" });
      await settledAfterJobResult(host, after);
      const results = await host.jobResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.details).toMatchObject({
        state: "inactive",
        outcome: "failed",
        exit_code: null
      });
    });
  });

  test("J2: a turn abort leaves a job running; job_abort stops its process group without a result", async () => {
    await withJobs(async (directory, start) => {
      const host = await start();
      const work = host.prompt("job-group-hold").catch((error: unknown) => error);
      const group = await jobGroup(directory);
      await host.request({ type: "abort" });
      await work;
      const job = await startedJob(host);
      expect(await jobList(host)).toMatchObject([{ job_id: job.job_id, state: "active" }]);
      expect(groupAlive(group)).toBe(true);

      await host.prompt(`job-abort-id ${job.job_id}`);
      const aborted = (await toolResults(host, "job_abort")).at(-1);
      expect(aborted?.isError).toBe(false);
      expect(jobDetailsSchema.parse(aborted?.details)).toMatchObject({
        job_id: job.job_id,
        state: "inactive",
        outcome: "cancelled"
      });
      expect(await groupGone(group)).toBe(true);
      expect(host.records.some(isJobResult)).toBe(false);
      expect(await host.jobResults()).toEqual([]);

      await host.prompt(`job-abort-id ${job.job_id}`);
      expect(contentText((await toolResults(host, "job_abort")).at(-1)?.content ?? "")).toContain(
        "Job is inactive"
      );
      await host.prompt("job-abort-id 00000000-0000-0000-0000-000000000000");
      expect(contentText((await toolResults(host, "job_abort")).at(-1)?.content ?? "")).toContain(
        "Unknown job"
      );
    });
  });

  test.each(["tree", "fork", "switch", "reload", "graceful exit"])(
    "J2: %s stops the job's process group without a result",
    async (action) => {
      await withJobs(async (directory, start) => {
        const host = await start();
        await host.prompt("reply");
        const saved = (await host.state()).sessionFile!;
        await host.request({ type: "new_session" });
        await host.prompt("reply");
        const anchor = (await host.entries()).at(-1)!.id;
        await host.prompt("job-group");
        const group = await jobGroup(directory);

        if (action === "tree")
          await host.request({ type: "prompt", message: `/fixture-tree ${anchor}` });
        else if (action === "fork")
          await host.request({ type: "prompt", message: `/fixture-parent-fork ${anchor}` });
        else if (action === "switch")
          await host.request({ type: "switch_session", sessionPath: saved });
        else if (action === "reload")
          await host.request({ type: "prompt", message: "/fixture-reload" });
        else {
          host.connection.closeInput();
          expect(await host.connection.closed).toMatchObject({ code: 0, signal: null });
        }

        expect(await groupGone(group)).toBe(true);
        expect(host.records.some(isJobResult)).toBe(false);
      });
    }
  );

  test("J2: a child's exit stops its job's process group", async () => {
    await withJobs(async (directory, start) => {
      const host = await start();
      const work = host.prompt("delegate-job");
      // The child ends only after its job has written its group.
      const group = await jobGroup(directory);
      await release(directory, "run-release");
      await work;
      expect(detailsSchema.parse((await host.results()).at(-1)?.details).state).toBe("completed");
      expect(await groupGone(group)).toBe(true);
    });
  });

  test.each(["print", "json"])(
    "J2: %s mode stops the job's process group at exit",
    async (mode) => {
      const directory = await createFixtureWorkspace({ settings: JOBS });

      try {
        const launch = await fixtureLaunch(directory);
        const child = promisify(execFile)(
          launch.command,
          [
            ...launch.args,
            "--print",
            ...(mode === "json" ? ["--mode", "json"] : []),
            "job-group-hold"
          ],
          { ...launch.options, timeout: STEP_TIMEOUT_MS }
        );
        child.child.stdin?.end();
        // The run ends only after the job has written its group.
        const group = await jobGroup(directory);
        await release(directory, "run-release");
        const { stdout } = await child;
        expect(stdout).toContain("Background job started");
        expect(await groupGone(group)).toBe(true);
        expect(await remainingProcesses(directory)).toEqual([]);
      } finally {
        await killFixtureProcesses(directory);
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  test("J3: restores jobs on the selected ancestry, and a job without an end entry as cancelled", async () => {
    await withJobs(async (directory, start) => {
      const host = await start();
      await host.prompt("reply");
      const before = (await host.entries()).at(-1)!.id;
      const after = host.records.length;
      await host.prompt("job-barrier");
      const first = await startedJob(host);
      await release(directory, "job-release");
      await settledAfterJobResult(host, after);
      const leaf = (await host.entries()).at(-1)!.id;
      const completed = {
        job_id: first.job_id,
        state: "inactive",
        outcome: "completed",
        exit_code: 0
      };

      await host.request({ type: "prompt", message: `/fixture-tree ${before}` });
      expect(await jobList(host)).toEqual([]);
      await host.request({ type: "prompt", message: `/fixture-tree ${leaf}` });
      expect(await jobList(host)).toMatchObject([completed]);

      await host.prompt("job-group");
      const second = await startedJob(host);
      const group = await jobGroup(directory);
      const { sessionId } = await host.state();
      host.connection.closeInput();
      await host.connection.closed;
      expect(await groupGone(group)).toBe(true);

      const restarted = await start({ sessionId });
      expect(await jobList(restarted)).toMatchObject([
        completed,
        { job_id: second.job_id, state: "inactive", outcome: "cancelled", exit_code: null }
      ]);
      expect(
        (await restarted.entries()).filter(
          (entry) =>
            entry.type === "custom" &&
            entry.customType === JOB_END_ENTRY &&
            z.object({ job_id: z.string() }).parse(entry.data).job_id === second.job_id
        )
      ).toEqual([]);
    });
  });

  test("J4: runs jobs with the shell path and command prefix", async () => {
    await withJobs(async (directory, start) => {
      const shell = join(directory, "agent", "fixture-shell");
      await writeFile(
        shell,
        '#!/bin/sh\nexport FIXTURE_JOB_SHELL=shell-applied\nexec bash "$@"\n',
        { mode: 0o755 }
      );
      const settingsFile = join(directory, "agent", "settings.json");
      const settings = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(await readFile(settingsFile, "utf8")));
      await writeFile(
        settingsFile,
        JSON.stringify({
          ...settings,
          shellPath: shell,
          shellCommandPrefix: "export FIXTURE_JOB_PREFIX=prefix-applied"
        })
      );
      const host = await start();
      const after = host.records.length;
      await host.prompt("job-shell");
      await settledAfterJobResult(host, after);
      expect(contentText((await host.jobResults())[0]?.content ?? "")).toContain(
        "shell-applied prefix-applied"
      );
    });
  });

  test("J4: hides job tools when another extension owns bash", async () => {
    await withJobs(
      async (_directory, start) => {
        const host = await start();
        await host.wait(
          (record) =>
            record.type === "extension_ui_request" &&
            record.method === "notify" &&
            record.message.includes("another extension owns bash")
        );
        await host.prompt("report-job-tools");
        const text = await host.request({ type: "get_last_assistant_text" });
        expect(text.command === "get_last_assistant_text" ? text.data.text : "").toBe(
          "job tools: false false"
        );
      },
      { extensions: [fileURLToPath(new URL("./foreign-bash.ts", import.meta.url))] }
    );
  });
});
