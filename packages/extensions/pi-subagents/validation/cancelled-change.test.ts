import { fileURLToPath } from "node:url";

import { contentText } from "@earendil-works/pi-ai";
import { test as caseTest, type ExpectStatic } from "vite-plus/test";
import { z } from "zod";

import type { RpcRecord } from "../src/child/connection.ts";
import { JOB_END_ENTRY } from "../src/constants.ts";
import { release, replies, taskList, withFixture } from "./background-fixture.ts";
import type { Supervisor } from "./supervisor.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

/** Cancels tree navigations and forks after pi-subagents' pre-event handlers run. */
const cancelChange = fileURLToPath(new URL("./cancel-change.ts", import.meta.url));

async function leaf(host: Supervisor): Promise<string | null> {
  const response = await host.request({ type: "get_tree" });
  if (response.command !== "get_tree") throw new Error("Missing supervisor tree");

  return response.data.leafId;
}

/** The first notification of a `/subagents` command; Pi answers a handled command after it returns. */
async function notification(host: Supervisor, command: string): Promise<string> {
  const mark = host.records.length;
  await host.request({ type: "prompt", message: `/subagents ${command}` });

  return (
    host.records
      .slice(mark)
      .flatMap((record) =>
        record.type === "extension_ui_request" && record.method === "notify" ? [record] : []
      )[0]?.message ?? "(no notification)"
  );
}

function isJobEnd(record: RpcRecord): boolean {
  return (
    record.type === "entry_appended" &&
    record.entry.type === "custom" &&
    record.entry.customType === JOB_END_ENTRY
  );
}

/** After the cancelled change, `list` and a new `subagent` call work again. */
async function expectTasksWork(
  host: Supervisor,
  expect: ExpectStatic,
  taskId: string,
  firstCall: string,
  label: string
): Promise<void> {
  expect.soft(await notification(host, "list"), `/subagents list after ${label}`).toContain(taskId);
  await host.prompt("delegate-reply");
  const second = (await host.results()).at(-1)!;
  expect(second.toolCallId).not.toBe(firstCall);
  expect(contentText(second.content)).not.toContain("Subagent session ended");
  expect(second.isError).toBe(false);
}

test("keeps the task binding after another extension cancels tree navigation", async ({
  expect
}) => {
  await withFixture(
    async (_directory, start) => {
      const host = await start();
      await host.prompt("reply");
      const anchor = (await host.entries()).at(-1)!.id;
      await host.prompt("delegate-reply");
      const first = (await host.results()).at(-1)!;
      expect(first.isError).toBe(false);
      const [task] = await taskList(host);
      expect(task?.state).toBe("inactive");
      const before = await leaf(host);

      await host.request({ type: "prompt", message: `/fixture-tree ${anchor}` });
      expect(await leaf(host)).toBe(before);

      await expectTasksWork(
        host,
        expect,
        task!.task_id,
        first.toolCallId,
        "the cancelled navigation"
      );
    },
    { extensions: [cancelChange] }
  );
});

test("keeps the task binding after another extension cancels a parent fork", async ({ expect }) => {
  await withFixture(
    async (_directory, start) => {
      const host = await start();
      await host.prompt("reply");
      const anchor = (await host.entries()).at(-1)!.id;
      await host.prompt("delegate-reply");
      const first = (await host.results()).at(-1)!;
      const [task] = await taskList(host);
      const { sessionId } = await host.state();

      await host.request({ type: "prompt", message: `/fixture-parent-fork ${anchor}` });
      expect((await host.state()).sessionId).toBe(sessionId);

      await expectTasksWork(host, expect, task!.task_id, first.toolCallId, "the cancelled fork");
    },
    { extensions: [cancelChange] }
  );
});

test("delivers a job result that waited across a cancelled navigation once in the next run", async ({
  expect
}) => {
  await withFixture(
    async (directory, start) => {
      const host = await start();
      await host.prompt("reply");
      const anchor = (await host.entries()).at(-1)!.id;
      await host.prompt("job-barrier");
      expect(await host.jobResults()).toHaveLength(0);

      await host.request({ type: "prompt", message: `/fixture-tree ${anchor}` });
      const after = host.records.length;
      await release(directory, "job-release");
      await host.wait(isJobEnd, after);

      const jobs = await notification(host, "jobs");
      expect.soft(jobs, "/subagents jobs after the cancelled navigation").toContain("completed");
      const listed = z
        .object({ jobs: z.array(z.object({ job_id: z.string() })) })
        .safeParse(JSON.parse(jobs.startsWith("{") ? jobs : "{}"));
      expect.soft(listed.data?.jobs, "listed jobs").toHaveLength(1);
      // The result waits for the next run.
      expect(await host.jobResults()).toHaveLength(0);

      await host.prompt("reply");
      expect(await host.jobResults()).toHaveLength(1);
    },
    { extensions: [cancelChange], settings: { "ext.pi-subagents": { jobs: true } } }
  );
});

test("ends a hold_run wait at a pending fork, and delivers the job result once in the next run", async ({
  expect
}) => {
  await withFixture(
    async (directory, start) => {
      const host = await start();
      await host.prompt("reply");
      const anchor = (await host.entries()).at(-1)!.id;
      const after = host.records.length;
      // After this reply, the run waits for the held job, which waits for its barrier.
      await host.reply("held-job-barrier");
      expect(host.records.slice(after).some(replies("background results 0"))).toBe(true);

      await host.request({ type: "prompt", message: `/fixture-parent-fork ${anchor}` });
      await host.wait((record) => record.type === "agent_settled", after);
      expect(host.records.slice(after).some(isJobEnd)).toBe(false);

      const ended = host.records.length;
      await release(directory, "job-release");
      await host.wait(isJobEnd, ended);
      // The result waits for the next run.
      expect(await host.jobResults()).toHaveLength(0);
      await host.prompt("reply");
      expect(await host.jobResults()).toHaveLength(1);
    },
    { extensions: [cancelChange], settings: { "ext.pi-subagents": { jobs: true } } }
  );
});
