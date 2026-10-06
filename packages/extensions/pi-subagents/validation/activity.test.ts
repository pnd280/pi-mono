import { copyFile, readFile, rm } from "node:fs/promises";

import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { ChildRun } from "../src/child.ts";
import { taskRecordSchema } from "../src/records.ts";
import { detailsSchema } from "../src/result.ts";
import { TaskSource } from "../src/source.ts";
import { remainingProcesses, killFixtureProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

test.skipIf(process.platform !== "linux")(
  "scopes real display activity to each child and resets it when a task resumes",
  async () => {
    const directory = await createFixtureWorkspace({ display: true });
    const host = await Supervisor.start(directory);

    try {
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
      ).toContain("Read 1 file");
      expect(
        updates.some(
          (detail) =>
            detail.description === "Write activity task" && detail.activity === "Created 1 file"
        )
      ).toBe(true);
      expect(
        updates.some(
          (detail) =>
            detail.description === "Read activity task" && detail.activity.includes("Created")
        )
      ).toBe(false);
      const page = z
        .object({ tasks: z.array(taskRecordSchema) })
        .parse(JSON.parse((await host.command("list")).message));
      const task = page.tasks.find((item) => item.description === "Read activity task")!;
      const original = await readFile(task.session_file, "utf8");
      expect(original).toContain("pi-tool-display.transcript");
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
      const sessionFile = `${directory}/source-session.jsonl`;
      await copyFile(task.session_file, sessionFile);
      const replacementTask = page.tasks.find(
        (item) => item.description === "Write activity task"
      )!;
      const replacementBytes = await readFile(replacementTask.session_file, "utf8");
      const checkpointBytes = await readFile(task.checkpoint.file);
      const replacementCheckpointBytes = await readFile(replacementTask.checkpoint.file);
      const launch = await fixtureLaunch(directory);
      const run = new ChildRun({
        invocation: launch,
        cwd: `${directory}/work`,
        env: launch.options.env,
        depth: 1,
        model: task.model,
        thinking: task.thinking,
        trusted: true,
        sessionFile,
        prompt: "slow"
      });

      try {
        expect(await run.started).toMatchObject({ sessionId: task.session_id });
        await run.connection.request({ type: "get_state" });
        await expect.poll(() => run.connection.pendingCount).toBe(0);
        const first = new TaskSource({ run, task: { ...task, session_file: sessionFile } });
        const replacement = new TaskSource({ task: replacementTask });
        let disposedUpdates = 0;
        first.subscribe(() => {
          disposedUpdates++;
        });
        let snapshots = 0;
        const unsubscribe = run.connection.subscribe((record) => {
          if (record.type === "response" && record.success && record.command === "get_entries")
            snapshots++;
        });

        try {
          // Hold actual RPC bytes while the refresh request is in flight.
          run.connection.process.stdout.pause();
          first.refresh();
          await expect.poll(() => run.connection.pendingCount).toBe(1);
          expect(snapshots).toBe(0);
          first.dispose();
          replacement.refresh();
          await expect.poll(() => replacement.model?.messages.length ?? 0).toBeGreaterThan(0);
          expect(replacement.unavailable).toBeUndefined();
          const replacementMessages = JSON.stringify(replacement.model?.messages);
          expect(replacementMessages).toContain("activity-write");
          expect(replacementMessages).not.toContain("activity-read");

          run.connection.process.stdout.resume();
          await expect.poll(() => snapshots).toBe(1);
          // A subsequent round trip also lets the earlier snapshot continuation finish.
          await run.connection.request({ type: "get_state" });
          expect(first.model).toBeUndefined();
          expect(first.unavailable).toBeUndefined();
          expect(disposedUpdates).toBe(0);
          expect(JSON.stringify(replacement.model?.messages)).toBe(replacementMessages);
          expect(await readFile(task.session_file, "utf8")).toBe(original);
          expect(await readFile(replacementTask.session_file, "utf8")).toBe(replacementBytes);
          expect(await readFile(task.checkpoint.file)).toEqual(checkpointBytes);
          expect(await readFile(replacementTask.checkpoint.file)).toEqual(
            replacementCheckpointBytes
          );
        } finally {
          run.connection.process.stdout.resume();
          unsubscribe();
          first.dispose();
          first.model?.dispose();
          replacement.dispose();
        }
      } finally {
        await run.terminate("Activity fixture finished");
      }
    } finally {
      await host.stop();
      const leaked = await remainingProcesses(directory);
      await killFixtureProcesses(directory);
      await rm(directory, { recursive: true, force: true });
      expect(leaked).toEqual([]);
    }
  },
  30_000
);
