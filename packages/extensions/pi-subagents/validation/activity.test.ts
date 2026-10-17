import { randomUUID } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { ChildRun } from "../src/child/run.ts";
import { RunReader } from "../src/history/reader.ts";
import { detailsSchema } from "../src/result.ts";
import { taskRecordSchema, type TaskRecord } from "../src/tasks/records.ts";
import type { TaskEvent } from "../src/tasks/registry.ts";
import { withFixture } from "./background-fixture.ts";
import { fixtureLaunch } from "./workspace.ts";

test.skipIf(process.platform !== "linux")(
  "scopes activity to each child and resets it when a task resumes",
  async () => {
    await withFixture(async (directory, start) => {
      const host = await start();
      await host.prompt("activity-pair");
      const updates = host.records.flatMap((event) => {
        if (event.type !== "tool_execution_update" || event.toolName !== "subagent") return [];
        const parsed = z.object({ details: detailsSchema }).safeParse(event.partialResult).data;

        return parsed ? [parsed.details] : [];
      });
      expect(
        updates
          .filter((detail) => detail.description === "Read activity task")
          .map((detail) => detail.activity)
      ).toContain("read");
      expect(
        updates.some(
          (detail) => detail.description === "Write activity task" && detail.activity === "write"
        )
      ).toBe(true);
      expect(
        updates.some(
          (detail) => detail.description === "Read activity task" && detail.activity === "write"
        )
      ).toBe(false);
      const list = async () =>
        z
          .object({ tasks: z.array(taskRecordSchema) })
          .parse(JSON.parse((await host.command("list")).message)).tasks;
      const task = (await list()).find((item) => item.description === "Read activity task")!;
      const resumedAt = host.records.length;
      await host.prompt(`resume-activity-id ${task.task_id}`);
      const resumedActivity = host.records.slice(resumedAt).flatMap((event) => {
        if (event.type !== "tool_execution_update" || event.toolName !== "subagent") return [];
        const details = z.object({ details: detailsSchema }).safeParse(event.partialResult)
          .data?.details;

        return details?.activity ? [details.activity] : [];
      });
      expect(resumedActivity).toContain("write");
      expect(resumedActivity).not.toContain("read");
      const after = host.records.length;
      const work = host.prompt(`resume-slow-id ${task.task_id}`);
      await host.wait((event) => {
        if (event.type !== "tool_execution_update") return false;
        const details = z.object({ details: detailsSchema }).safeParse(event.partialResult)
          .data?.details;

        return details?.task_id === task.task_id && details.state === "running";
      }, after);
      const current = host.records
        .slice(after)
        .flatMap((event) =>
          event.type === "tool_execution_update"
            ? [
                z.object({ details: detailsSchema }).safeParse(event.partialResult).data?.details
                  .activity
              ]
            : []
        );
      expect(current.every((activity) => activity === "")).toBe(true);
      await host.command(`abort ${task.task_id}`);
      await work;

      // Open only a disposable copy; the source conversations must remain unchanged.
      const tasks = await list();
      const stopped = tasks.find((item) => item.task_id === task.task_id)!;
      const original = await readFile(task.session_file, "utf8");
      const sessionFile = `${directory}/source-session.jsonl`;
      await copyFile(task.session_file, sessionFile);
      const replacementTask = tasks.find((item) => item.description === "Write activity task")!;
      const replacementBytes = await readFile(replacementTask.session_file, "utf8");
      const launch = await fixtureLaunch(directory);
      const runId = randomUUID();
      const run = new ChildRun({
        invocation: launch,
        cwd: `${directory}/work`,
        env: launch.options.env,
        depth: 1,
        model: task.model,
        thinking: task.thinking,
        trusted: true,
        sessionFile,
        taskId: task.task_id,
        runId,
        previousRunId: stopped.run_id,
        prompt: "slow"
      });

      try {
        expect(await run.started).toMatchObject({ sessionId: task.session_id });
        await run.connection.request({ type: "get_state" });
        await expect.poll(() => run.connection.pendingCount, { timeout: STEP_TIMEOUT_MS }).toBe(0);
        // The reader follows this run as `Tasks` would report it; the run itself is real.
        const live: TaskRecord = { ...stopped, session_file: sessionFile, run_id: runId };
        const records = new Map([
          [live.task_id, live],
          [replacementTask.task_id, replacementTask]
        ]);
        const listeners = new Set<(event: TaskEvent) => void>();
        const reader = new RunReader({
          subscribe: (listener) => {
            listeners.add(listener);

            return () => listeners.delete(listener);
          },
          owned: (id) => {
            const record = records.get(id);
            if (!record) throw new Error("Task does not belong to this session");

            return record;
          }
        });
        let snapshots = 0;
        const unsubscribe = run.connection.subscribe((record) => {
          if (record.type === "response" && record.success && record.command === "get_entries")
            snapshots++;
        });
        const views: { dispose(): void }[] = [];

        try {
          // Hold actual RPC bytes while the view's first read is in flight.
          run.connection.process.stdout.pause();
          for (const listener of listeners) listener({ kind: "run", record: live, run });
          const first = reader.observe(live.task_id);
          views.push(first);
          let disposedUpdates = 0;
          first.subscribe(() => {
            disposedUpdates++;
          });
          await expect
            .poll(() => run.connection.pendingCount, { timeout: STEP_TIMEOUT_MS })
            .toBe(1);
          expect(snapshots).toBe(0);
          first.dispose();
          const replacement = reader.observe(replacementTask.task_id);
          views.push(replacement);
          await expect
            .poll(() => replacement.transcript?.items().length ?? 0, { timeout: STEP_TIMEOUT_MS })
            .toBeGreaterThan(0);
          expect(replacement.unavailable).toBeUndefined();
          const replacementMessages = JSON.stringify(replacement.transcript?.items());
          expect(replacementMessages).toContain("activity-write");
          expect(replacementMessages).not.toContain("activity-read");

          run.connection.process.stdout.resume();
          // The reader's live source can read again after the first view is disposed.
          await expect
            .poll(() => snapshots, { timeout: STEP_TIMEOUT_MS })
            .toBeGreaterThanOrEqual(1);
          // A subsequent round trip also lets the earlier snapshot continuation finish.
          await run.connection.request({ type: "get_state" });
          expect(first.transcript).toBeUndefined();
          expect(first.unavailable).toBeUndefined();
          expect(disposedUpdates).toBe(0);
          expect(JSON.stringify(replacement.transcript?.items())).toBe(replacementMessages);
          expect(await readFile(task.session_file, "utf8")).toBe(original);
          expect(await readFile(replacementTask.session_file, "utf8")).toBe(replacementBytes);
        } finally {
          run.connection.process.stdout.resume();
          unsubscribe();
          for (const view of views) view.dispose();
          reader.dispose();
        }
      } finally {
        await run.terminate("Activity fixture finished");
      }
    });
  }
);
