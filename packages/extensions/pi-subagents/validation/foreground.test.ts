import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import {
  parseSessionEntries,
  SessionManager,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { END_ENTRY, MARKER_ENTRY, RUN_ENTRY } from "../src/constants.ts";
import { readTaskSnapshot } from "../src/history/sessions.ts";
import { detailsSchema } from "../src/result.ts";
import { endRecordSchema, runRecordSchema, taskRecordSchema } from "../src/tasks/records.ts";
import { withFixture } from "./background-fixture.ts";
import { fixtureProcesses, remainingProcesses } from "./processes.ts";
import type { Supervisor } from "./supervisor.ts";

async function list(host: Supervisor) {
  const notification = await host.command("list");
  const data: unknown = JSON.parse(notification.message);

  return z.object({ tasks: z.array(taskRecordSchema) }).parse(data).tasks;
}

/** The supervisor's run and end entries, which are its only task entries. */
function isRunEntry(entry: SessionEntry): boolean {
  return (
    entry.type === "custom" && (entry.customType === RUN_ENTRY || entry.customType === END_ENTRY)
  );
}

async function activeTask(host: Supervisor, after = 0) {
  const record = await host.wait(
    (event) =>
      event.type === "entry_appended" &&
      event.entry.type === "custom" &&
      event.entry.customType === RUN_ENTRY,
    after
  );
  if (record.type !== "entry_appended" || record.entry.type !== "custom")
    throw new Error("Missing active task");

  return runRecordSchema.parse(record.entry.data);
}

async function waitForBash(host: Supervisor): Promise<void> {
  await host.wait(
    (event) =>
      event.type === "tool_execution_update" &&
      event.toolName === "subagent" &&
      z.object({ details: detailsSchema }).safeParse(event.partialResult).data?.details.activity ===
        "bash"
  );
}

describe.skipIf(process.platform !== "linux").concurrent("foreground subagents", () => {
  test("returns the child's text and state, including provider and launch failures", async () => {
    await withFixture(async (_directory, start) => {
      const host = await start();

      for (const [scenario, state, text] of [
        ["delegate-reply", "completed", "Fixture reply"],
        ["delegate-command", "completed", "Fixture reply"],
        ["delegate-error", "failed", "Fixture provider error"],
        ["delegate-cancelled", "cancelled", "Fixture child cancelled"],
        ["delegate-launch-error", "failed", "new_session failed (exit code 1"]
      ] as const) {
        await host.prompt(scenario);
        const result = (await host.results()).at(-1)!;
        expect(detailsSchema.parse(result.details).state).toBe(state);
        expect(contentText(result.content)).toContain(text);
        expect(result.isError).toBe(state !== "completed");
        if (scenario === "delegate-launch-error")
          expect(contentText(result.content)).toContain(
            'Model "pi-subagents-missing-provider/no-such-model" not found'
          );
      }

      expect((await list(host)).map((task) => task.outcome)).toEqual([
        "completed",
        "completed",
        "failed",
        "cancelled"
      ]);
    });
  }, 30_000);

  test.for([
    "completed task",
    "turn abort",
    "user abort",
    "session change",
    "graceful exit",
    "SIGKILL",
    "queued turn abort"
  ])("cleans up children on %s", { timeout: 45_000 }, async (action, { expect }) => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const stubborn = ["turn abort", "user abort", "session change", "graceful exit"].includes(
          action
        );
        let singleScenario = stubborn ? "delegate-stubborn" : "delegate-slow";
        if (action === "completed task") singleScenario = "delegate-shutdown-blocked";
        const scenario = action === "queued turn abort" ? "capacity" : singleScenario;
        const work = host.prompt(scenario).catch((error: unknown) => error);
        const child = await activeTask(host);
        if (stubborn) await waitForBash(host);

        if (action === "turn abort") {
          await expect
            .poll(async () => {
              const task = (await list(host))[0]!;

              return (await readTaskSnapshot(task)).entries.some(
                (entry) =>
                  entry.type === "message" &&
                  entry.message.role === "assistant" &&
                  entry.message.content.some(
                    (block) => block.type === "toolCall" && block.id === "fixture-sleep"
                  )
              );
            })
            .toBe(true);
        }

        const sessionFile = (await host.state()).sessionFile!;

        if (action === "completed task") {
          expect(await work).toBeUndefined();
          expect(detailsSchema.parse((await host.results()).at(-1)!.details).state).toBe("failed");
        } else if (action === "user abort") {
          const notification = await host.command(`abort ${child.task_id}`);
          expect(JSON.parse(notification.message)).toMatchObject({
            state: "inactive",
            outcome: "cancelled"
          });
        } else if (action === "session change") {
          await host.request({ type: "new_session" });
          expect(await list(host)).toEqual([]);
          // A run without an end entry stays cancelled in the saved session.
          const records = SessionManager.open(sessionFile).getEntries().filter(isRunEntry);
          expect(records.at(-1)).toMatchObject({
            customType: RUN_ENTRY,
            data: { task_id: child.task_id }
          });
        } else if (action === "graceful exit") {
          host.connection.closeInput();
          await host.connection.closed;
        } else if (action === "SIGKILL") {
          host.connection.process.kill("SIGKILL");
          await host.connection.closed;
        } else {
          await host.request({ type: "abort" });
        }

        await work;

        if (action === "SIGKILL" || action === "graceful exit")
          expect(await remainingProcesses(directory)).toEqual([]);
        else {
          const tasks = await list(host);
          expect(tasks.every((task) => task.state === "inactive")).toBe(true);
          expect(await fixtureProcesses(directory)).toHaveLength(1);
          if (action === "queued turn abort") expect(tasks).toHaveLength(1);
        }
      },
      {
        settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } }
      }
    );
  });

  test.each(["tree", "fork", "switch"])(
    "isolates the replacement binding and immediately stops owned subtrees on %s",
    async (transition) => {
      await withFixture(
        async (directory, start) => {
          const host = await start();
          await host.prompt("reply");
          const savedSession = (await host.state()).sessionFile!;
          await host.request({ type: "new_session" });
          await host.prompt("reply");
          const anchor = (await host.entries()).at(-1)!.id;
          const oldSession = (await host.state()).sessionId;
          await host.reply("background-slow");
          const background = (await list(host))[0]!;
          const work = host.prompt("nested-stubborn").catch((error: unknown) => error);

          for (let index = 0; index < 200; index++) {
            if (
              (await fixtureProcesses(directory)).some(({ command }) =>
                command.includes("sleep 600")
              )
            )
              break;
            if (index === 199) throw new Error("Detached descendant did not start");
            await setTimeout(25);
          }

          expect(
            (await list(host)).find((task) => task.task_id === background.task_id)?.state
          ).toBe("active");
          if (transition === "tree") await host.request({ type: "abort" });
          const navigation =
            transition === "switch"
              ? host.request({ type: "switch_session", sessionPath: savedSession })
              : host.request({
                  type: "prompt",
                  message: `/fixture-${transition === "tree" ? "tree" : "parent-fork"} ${anchor}`
                });
          expect(
            (await remainingProcesses(directory, 2000)).filter(
              ({ pid }) => pid !== host.connection.process.pid
            )
          ).toEqual([]);
          await navigation;
          await work;
          expect(await list(host)).toEqual([]);
          expect((await host.state()).sessionId === oldSession).toBe(transition === "tree");
          const count = (await host.entries()).filter(isRunEntry).length;
          await host.prompt("reply");
          expect(await list(host)).toEqual([]);
          expect((await host.entries()).filter(isRunEntry)).toHaveLength(count);
        },
        { settings: { "ext.pi-subagents": { maxDepth: 2, maxConcurrent: 4 } } }
      );
    },
    40_000
  );

  test("resumes stopped tasks in their child file from the selected ancestry with stable IDs", async () => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        await host.prompt("delegate-remember");
        const original = (await list(host))[0]!;
        const records = (await host.entries()).filter(isRunEntry);
        const empty = records[0]!.id;
        const saved = records.at(-1)!.id;
        await host.prompt(`extend-id ${original.task_id}`);
        expect((await list(host)).length).toBeGreaterThan(1);
        const laterBytes = await readFile(original.session_file, "utf8");
        await host.request({ type: "prompt", message: `/fixture-tree ${saved}` });
        expect(await list(host)).toEqual([original]);
        await host.prompt(`history-id ${original.task_id}`);
        const resumedText = contentText((await host.results()).at(-1)!.content);
        expect(resumedText).toContain("remember");
        expect(resumedText).not.toContain("nested-background");
        expect(await list(host)).toMatchObject([
          {
            task_id: original.task_id,
            session_id: original.session_id,
            session_file: original.session_file
          }
        ]);
        // A resume appends to the child file and keeps the excluded run.
        expect((await readFile(original.session_file, "utf8")).startsWith(laterBytes)).toBe(true);

        const leaf = (await host.entries()).at(-1)!.id;
        await host.request({ type: "prompt", message: `/fixture-parent-fork ${leaf}` });
        expect(await list(host)).toHaveLength(1);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        await host.request({ type: "prompt", message: `/fixture-tree ${empty}` });
        expect(await list(host)).toMatchObject([
          { task_id: original.task_id, state: "inactive", outcome: "cancelled" }
        ]);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        // A run without an end entry continues its own history, without the later runs.
        await host.prompt(`history-id ${original.task_id}`);
        const cancelledText = contentText((await host.results()).at(-1)!.content);
        expect(cancelledText).toContain("remember");
        expect(cancelledText).not.toContain("nested-background");
        expect(cancelledText.split("history-context")).toHaveLength(2);
        expect(await list(host)).toHaveLength(1);

        const after = host.records.length;
        const work = host.prompt("delegate-stubborn").catch((error: unknown) => error);
        const interrupted = await activeTask(host, after);
        await waitForBash(host);

        for (let index = 0; index < 200; index++) {
          if ((await fixtureProcesses(directory)).some(({ command }) => command === "sleep 600"))
            break;
          if (index === 199) throw new Error("Interrupted effect did not finish");
          await setTimeout(25);
        }

        const effect = await stat(`${directory}/work/interrupted-effect`);
        await host.request({ type: "abort" });
        await work;
        const warningStart = host.records.length;
        await host.prompt(`history-id ${interrupted.task_id}`);
        expect(
          host.records
            .slice(warningStart)
            .some(
              (event) =>
                event.type === "extension_ui_request" &&
                event.method === "notify" &&
                event.notifyType === "warning"
            )
        ).toBe(true);
        expect((await stat(`${directory}/work/interrupted-effect`)).mtimeMs).toBe(effect.mtimeMs);
        expect(await fixtureProcesses(directory)).toHaveLength(1);

        // The supervisor stores two small entries per run, whatever its children write.
        const stored = host.records.flatMap((event) =>
          event.type === "entry_appended" &&
          event.entry.type === "custom" &&
          event.entry.customType.startsWith("pi-subagents.")
            ? [event.entry]
            : []
        );
        const runs = stored.flatMap((entry) =>
          entry.customType === RUN_ENTRY ? [runRecordSchema.parse(entry.data).run_id] : []
        );
        const ends = stored.flatMap((entry) =>
          entry.customType === END_ENTRY ? [endRecordSchema.parse(entry.data).run_id] : []
        );
        expect(stored).toHaveLength(runs.length + ends.length);
        expect(runs).toHaveLength(
          host.records.filter(
            (event) => event.type === "tool_execution_start" && event.toolName === "subagent"
          ).length
        );
        expect(new Set(runs).size).toBe(runs.length);
        expect(new Set(ends).size).toBe(ends.length);
        expect(ends.every((run) => runs.includes(run))).toBe(true);
        for (const entry of stored)
          expect(Buffer.byteLength(JSON.stringify(entry.data))).toBeLessThan(2048);
        expect(await readdir(join(directory, "agent"))).not.toContain("pi-subagents");
        expect(
          (await readdir(dirname(original.session_file))).filter((name) => name.endsWith(".lease"))
        ).toEqual([]);
      },
      { settings: { "ext.pi-subagents": { maxDepth: 3, maxConcurrent: 6 } } }
    );
  }, 60_000);

  test("resumes with the selection that the task's latest run on the selected ancestry requested", async () => {
    await withFixture(async (_directory, start) => {
      const host = await start();

      /** The model and thinking level of the child's provider request. */
      const selection = async (scenario: string) => {
        await host.prompt(scenario);

        return /Selection: (\S+)/.exec(contentText((await host.results()).at(-1)!.content))?.[1];
      };

      expect(await selection("delegate-reasoning")).toBe("subagents-fixture/reasoning:high");
      const taskId = (await list(host))[0]!.task_id;
      const launched = (await host.entries()).at(-1)!.id;
      // The scripted model has no thinking levels, so this run applies `off` but requests `low`.
      expect(await selection(`selection-id ${taskId} model=scripted thinking=low`)).toBe(
        "subagents-fixture/scripted:off"
      );
      // The supervisor's own selection is `subagents-fixture/scripted:off`. A value in the call
      // replaces only its own field.
      expect(await selection(`selection-id ${taskId} model=reasoning`)).toBe(
        "subagents-fixture/reasoning:low"
      );
      // The later runs stay at the end of the child file, but they are not on the selected ancestry.
      await host.request({ type: "prompt", message: `/fixture-tree ${launched}` });
      expect(await selection(`selection-id ${taskId}`)).toBe("subagents-fixture/reasoning:high");
    });
  }, 30_000);

  test.each([false, true])(
    "uses only trusted project settings for limits and docs, and passes the chosen trust flag (%s)",
    async (trusted) => {
      await withFixture(
        async (directory, start) => {
          await Promise.all([
            writeFile(join(directory, "agent", "docs.md"), "GLOBAL_SUBAGENT_DOCS\n"),
            writeFile(join(directory, "work", ".pi", "docs.md"), "PROJECT_SUBAGENT_DOCS\n")
          ]);
          const host = await start({ trusted });
          await host.prompt("delegate-trust");
          const result = (await host.results()).at(-1)!;
          expect(detailsSchema.parse(result.details).state).toBe("completed");
          expect(contentText(result.content)).toContain(
            JSON.stringify({ approve: trusted, no_approve: !trusted })
          );
          // A trusted project list replaces the global one; each path resolves in its own scope.
          await host.prompt("report-docs");
          const description = (await host.entries())
            .flatMap((entry) =>
              entry.type === "message" && entry.message.role === "assistant"
                ? [contentText(entry.message.content)]
                : []
            )
            .at(-1);
          expect(description).toContain(trusted ? "PROJECT_SUBAGENT_DOCS" : "GLOBAL_SUBAGENT_DOCS");
          expect(description).not.toContain(
            trusted ? "GLOBAL_SUBAGENT_DOCS" : "PROJECT_SUBAGENT_DOCS"
          );
          // Only a trusted project turns on jobs.
          await host.prompt("report-job-tools");
          const tools = await host.request({ type: "get_last_assistant_text" });
          expect(tools.command === "get_last_assistant_text" ? tools.data.text : "").toBe(
            `job tools: ${trusted} ${trusted}`
          );
        },
        {
          // In either direction, loading the wrong settings disables the tool and breaks this call.
          settings: { "ext.pi-subagents": { maxDepth: trusted ? 0 : 2, docs: ["docs.md"] } },
          projectSettings: {
            "ext.pi-subagents": { maxDepth: trusted ? 2 : 0, docs: ["docs.md"], jobs: true }
          }
        }
      );
    },
    30_000
  );

  test("recovers task ownership and context across restart, and counts each call's usage once", async () => {
    await withFixture(async (directory, start) => {
      const host = await start();
      await host.prompt("delegate-remember");
      const first = (await host.results()).at(-1)!;
      const taskId = detailsSchema.parse(first.details).task_id!;
      expect(first.usage).toMatchObject({
        input: 10,
        output: 5,
        totalTokens: 15,
        cost: { total: 0.001 }
      });
      expect((await host.stats()).tokens.total).toBe(45);
      const saved = (await list(host)).find((task) => task.task_id === taskId)!;
      const { sessionId } = await host.state();
      const after = host.records.length;
      const work = host.prompt("delegate-slow").catch((error: unknown) => error);
      const stale = await activeTask(host, after);
      host.connection.process.kill("SIGKILL");
      await host.connection.closed;
      await work;
      expect(await remainingProcesses(directory)).toEqual([]);

      const resumed = await start({ sessionId });
      expect(await list(resumed)).toContainEqual(
        expect.objectContaining({ task_id: stale.task_id, state: "inactive", outcome: "cancelled" })
      );
      const before = await resumed.stats();
      await resumed.prompt(`resume-id ${taskId}`);
      const last = (await resumed.results()).at(-1)!;
      expect(contentText(last.content)).toContain("Remembered fixture seed");
      expect(last.usage).toMatchObject({
        input: 10,
        output: 5,
        totalTokens: 15,
        cost: { total: 0.001 }
      });
      expect((await resumed.stats()).tokens.total - before.tokens.total).toBe(45);
      expect((await list(resumed)).find((task) => task.task_id === taskId)?.session_file).toBe(
        saved.session_file
      );
      // The task total adds each run's own usage, also when it is restored from the session.
      const total = { input: 20, output: 10, cache_read: 0, cache_write: 0, cost: 0.002 };
      expect((await list(resumed)).find((task) => task.task_id === taskId)?.usage).toEqual(total);
      await resumed.stop();
      const restored = await start({ sessionId });
      expect((await list(restored)).find((task) => task.task_id === taskId)?.usage).toEqual(total);
    });
  }, 30_000);

  test("rejects resume and abort for tasks owned by another supervisor", async () => {
    await withFixture(async (_directory, start) => {
      const owner = await start();
      await owner.prompt("delegate-remember");
      const child = (await list(owner))[0]!;
      const before = await readFile(child.session_file, "utf8");
      const other = await start();
      await other.prompt(`resume-id ${child.task_id}`);
      const result = (await other.results()).at(-1)!;
      expect(result.isError).toBe(true);
      expect(contentText(result.content)).toContain("Task does not belong to this session");
      const notice = await other.command(`abort ${child.task_id}`);
      expect(notice.notifyType).toBe("error");
      expect(JSON.parse(notice.message)).toEqual({ error: "Task does not belong to this session" });
      expect(await list(other)).toEqual([]);
      expect(await readFile(child.session_file, "utf8")).toBe(before);
    });
  }, 30_000);

  test("lets one process at a time write a task's child file, also after its supervisor is killed", async ({
    expect
  }) => {
    await withFixture(async (directory, start) => {
      const first = await start();
      await first.prompt("delegate-remember");
      const task = (await list(first))[0]!;
      // A fork of the supervisor session owns the same task.
      const second = await start({ fork: (await first.state()).sessionFile! });
      const runs = async () =>
        parseSessionEntries(await readFile(task.session_file, "utf8")).filter(
          (entry) => entry.type === "custom" && entry.customType === MARKER_ENTRY
        ).length;
      const others = async () =>
        (await fixtureProcesses(directory)).filter(
          ({ pid }) => pid !== second.connection.process.pid
        );

      const rejected = async () => {
        await second.prompt(`history-id ${task.task_id}`);
        const result = (await second.results()).at(-1)!;
        expect(result.isError).toBe(true);
        expect(contentText(result.content)).toContain("Task is running in another process");
        // No second writer started a run in the file.
        expect(await runs()).toBe(2);
      };

      const work = first.prompt(`stubborn-id ${task.task_id}`).catch((error: unknown) => error);
      await expect
        .poll(async () => (await others()).some(({ command }) => command.includes("sleep 600")), {
          // The resumed child starts a new Pi process, which takes seconds under full load.
          timeout: 10_000,
          interval: 25
        })
        .toBe(true);
      await rejected();

      // The child ignores EOF and outlives its supervisor, so it can still write.
      first.connection.process.kill("SIGKILL");
      await first.connection.closed;
      await work;
      await rejected();

      for (const { pid } of await others()) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* It exited after the listing. */
        }
      }

      await expect.poll(others).toEqual([]);
      await second.prompt(`history-id ${task.task_id}`);
      expect(detailsSchema.parse((await second.results()).at(-1)!.details).state).toBe("completed");
      expect(await runs()).toBe(3);
      // The dead writers' entry was removed with the lease.
      expect(
        (await readdir(dirname(task.session_file))).filter((name) => name.endsWith(".lease"))
      ).toEqual([]);
    });
  }, 45_000);

  test.each(["confirm", "select"] as const)(
    "forwards a child %s dialog and delivers its answer",
    async (method) => {
      await withFixture(async (_directory, start) => {
        const host = await start();
        const work = host.prompt(method === "confirm" ? "delegate-dialog" : "delegate-selection");
        const request = await host.wait(
          (record) => record.type === "extension_ui_request" && record.method === method
        );
        if (request.type !== "extension_ui_request") throw new Error("Missing dialog request");

        if (request.method === "confirm") {
          expect(request).toMatchObject({
            title: "[subagent: Fixture dialog task] Fixture question",
            message: "Continue this child task?",
            timeout: 10_000
          });
          await host.connection.respond({
            type: "extension_ui_response",
            id: request.id,
            confirmed: true
          });
        } else if (request.method === "select") {
          // Distinct child options can collide after terminal sanitisation.
          await host.connection.respond({
            type: "extension_ui_response",
            id: request.id,
            value: request.options[1]!
          });
        }

        await work;
        expect(contentText((await host.results()).at(-1)!.content)).toContain(
          method === "confirm" ? "Dialog accepted" : "Selected second option"
        );
      });
    },
    30_000
  );

  test("respects capacity, admits queued launches FIFO, and rejects a full queue", async () => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const work = host.prompt("capacity");
        const child = await activeTask(host);
        expect(await fixtureProcesses(directory)).toHaveLength(2);
        expect(await list(host)).toHaveLength(1);
        await host.command(`abort ${child.task_id}`);
        await work;
        const tasks = await list(host);
        expect(tasks.map((task) => task.description)).toEqual([
          "First capacity task",
          "Second capacity task",
          "Third capacity task"
        ]);
        const overflow = (await host.results()).find(
          (result) =>
            detailsSchema.safeParse(result.details).data?.description === "Overflow capacity task"
        )!;
        expect(contentText(overflow.content)).toContain("launch queue is full (");
        expect(overflow.isError).toBe(true);
        const live = new Set<string>();

        // The end entry follows the run's process exit, before its capacity is released.
        for (const event of host.records) {
          if (event.type !== "entry_appended" || event.entry.type !== "custom") continue;
          if (event.entry.customType === RUN_ENTRY)
            live.add(runRecordSchema.parse(event.entry.data).run_id);
          else if (event.entry.customType === END_ENTRY)
            live.delete(endRecordSchema.parse(event.entry.data).run_id);
          expect(live.size).toBeLessThanOrEqual(1);
        }
      },
      { settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } } }
    );
  }, 30_000);
});
