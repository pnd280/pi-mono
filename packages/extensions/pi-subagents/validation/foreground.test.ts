import { readFile, rm, stat } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createTranscriptModel } from "pi-tool-display/viewer";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { readCheckpoint } from "../src/checkpoints.ts";
import { TASK_ENTRY } from "../src/constants.ts";
import { taskRecordSchema } from "../src/records.ts";
import { detailsSchema } from "../src/result.ts";
import { fixtureProcesses, killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

async function withFixture(
  body: (
    directory: string,
    start: (options?: Parameters<typeof Supervisor.start>[1]) => Promise<Supervisor>
  ) => Promise<void>,
  options: Parameters<typeof createFixtureWorkspace>[0] = {}
): Promise<void> {
  const directory = await createFixtureWorkspace(options);
  const hosts: Supervisor[] = [];

  try {
    await body(directory, async (launchOptions) => {
      const host = await Supervisor.start(directory, launchOptions);
      hosts.push(host);

      return host;
    });
  } finally {
    await Promise.all(hosts.map((host) => host.stop()));
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked, "Processes leaked after the supervisor exited").toEqual([]);
  }
}

async function list(host: Supervisor) {
  const notification = await host.command("list");
  const data: unknown = JSON.parse(notification.message);

  return z.object({ tasks: z.array(taskRecordSchema) }).parse(data).tasks;
}

async function activeTask(host: Supervisor, after = 0) {
  const record = await host.wait(
    (event) =>
      event.type === "entry_appended" &&
      event.entry.type === "custom" &&
      event.entry.customType === TASK_ENTRY &&
      taskRecordSchema.safeParse(event.entry.data).data?.state === "active",
    after
  );
  if (record.type !== "entry_appended" || record.entry.type !== "custom")
    throw new Error("Missing active task");

  return taskRecordSchema.parse(record.entry.data);
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

describe.skipIf(process.platform !== "linux")("foreground subagents", () => {
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

  test.each([
    "completed task",
    "turn abort",
    "user abort",
    "session change",
    "graceful exit",
    "SIGKILL",
    "queued turn abort"
  ])(
    "cleans up children on %s",
    async (action) => {
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

                return (await readCheckpoint(task)).entries.some(
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
            expect(detailsSchema.parse((await host.results()).at(-1)!.details).state).toBe(
              "failed"
            );
          } else if (action === "user abort") {
            const notification = await host.command(`abort ${child.task_id}`);
            expect(JSON.parse(notification.message)).toMatchObject({
              state: "inactive",
              outcome: "cancelled"
            });
          } else if (action === "session change") {
            await host.request({ type: "new_session" });
            expect(await list(host)).toEqual([]);
            const records = SessionManager.open(sessionFile)
              .getEntries()
              .filter((entry) => entry.type === "custom" && entry.customType === TASK_ENTRY);
            expect(records.at(-1)).toMatchObject({
              data: { state: "active", outcome: null }
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

            if (action === "turn abort" || action === "user abort") {
              const snapshot = await readCheckpoint(tasks[0]!);
              const model = createTranscriptModel({ ...snapshot, historical: true });

              try {
                const call = model.display.coordinator.byId("fixture-sleep")!;
                expect(model.display.coordinator.interpretation(call).outcome).toBe("cancelled");
                expect(model.display.coordinator.summary(call).segments).toMatchObject([
                  { count: 1, counts: { cancelled: 1, unavailable: 0 } }
                ]);

                if (action === "user abort") {
                  expect(call.operation?.outcome).toBe("cancelled");
                  expect(call.operation?.durationMs).toBeGreaterThanOrEqual(0);
                  expect(contentText(call.result!.content)).toBe("Command aborted");
                } else {
                  // A hard kill supplies cancellation evidence, never a fabricated tool result.
                  expect(call.result).toBeUndefined();
                  expect(call.operation).toBeUndefined();
                }
              } finally {
                model.dispose();
              }
            }
          }
        },
        {
          display: action === "turn abort" || action === "user abort",
          settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } }
        }
      );
    },
    45_000
  );

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
          const count = (await host.entries()).filter(
            (entry) => entry.type === "custom" && entry.customType === TASK_ENTRY
          ).length;
          await host.prompt("reply");
          expect(await list(host)).toEqual([]);
          expect(
            (await host.entries()).filter(
              (entry) => entry.type === "custom" && entry.customType === TASK_ENTRY
            )
          ).toHaveLength(count);
        },
        { settings: { "ext.pi-subagents": { maxDepth: 2, maxConcurrent: 4 } } }
      );
    },
    40_000
  );

  test("restores only checkpoint history and explicitly resumes stopped tasks with stable IDs", async () => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        await host.prompt("delegate-remember");
        const original = (await list(host))[0]!;
        const originalBytes = await readFile(original.session_file, "utf8");
        const records = (await host.entries()).filter(
          (entry) => entry.type === "custom" && entry.customType === TASK_ENTRY
        );
        const empty = records[0]!.id;
        const saved = records.at(-1)!.id;
        await host.prompt(`extend-id ${original.task_id}`);
        expect((await list(host)).length).toBeGreaterThan(1);
        const later = (await list(host))[0]!;
        const laterBytes = await readFile(later.session_file, "utf8");
        await host.request({ type: "prompt", message: `/fixture-tree ${saved}` });
        expect(await list(host)).toEqual([original]);
        await host.prompt(`history-id ${original.task_id}`);
        const resumedText = contentText((await host.results()).at(-1)!.content);
        expect(resumedText).toContain("remember");
        expect(resumedText).not.toContain("nested-background");
        const resumed = (await list(host))[0]!;
        expect(resumed.task_id).toBe(original.task_id);
        expect(resumed.session_id).not.toBe(original.session_id);
        expect(await list(host)).toHaveLength(1);
        expect(await readFile(original.session_file, "utf8")).toBe(originalBytes);
        expect(await readFile(later.session_file, "utf8")).toBe(laterBytes);

        await host.request({ type: "prompt", message: "/fixture-legacy" });
        const legacyLeaf = (await host.entries()).at(-1)!.id;
        await host.request({ type: "prompt", message: `/fixture-parent-fork ${legacyLeaf}` });
        expect(await list(host)).toHaveLength(1);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        await host.request({ type: "prompt", message: `/fixture-tree ${empty}` });
        expect(await list(host)).toMatchObject([
          { task_id: original.task_id, state: "inactive", outcome: "cancelled" }
        ]);
        expect(await fixtureProcesses(directory)).toHaveLength(1);
        await host.prompt(`history-id ${original.task_id}`);
        expect(contentText((await host.results()).at(-1)!.content)).not.toContain("remember");
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
      },
      { settings: { "ext.pi-subagents": { maxDepth: 3, maxConcurrent: 6 } } }
    );
  }, 60_000);

  test.each([false, true])(
    "uses only trusted project settings and passes the chosen trust flag (%s)",
    async (trusted) => {
      await withFixture(
        async (_directory, start) => {
          const host = await start({ trusted });
          await host.prompt("delegate-trust");
          const result = (await host.results()).at(-1)!;
          expect(detailsSchema.parse(result.details).state).toBe("completed");
          expect(contentText(result.content)).toContain(
            JSON.stringify({ approve: trusted, no_approve: !trusted })
          );
        },
        {
          // In either direction, loading the wrong settings disables the tool and breaks this call.
          settings: { "ext.pi-subagents": { maxDepth: trusted ? 0 : 2 } },
          projectSettings: { "ext.pi-subagents": { maxDepth: trusted ? 2 : 0 } }
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
      expect((await list(resumed)).find((task) => task.task_id === taskId)?.session_file).not.toBe(
        saved.session_file
      );
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

        for (const event of host.records) {
          if (
            event.type !== "entry_appended" ||
            event.entry.type !== "custom" ||
            event.entry.customType !== TASK_ENTRY
          )
            continue;
          const record = taskRecordSchema.parse(event.entry.data);
          if (record.state === "active") live.add(record.task_id);
          else live.delete(record.task_id);
          expect(live.size).toBeLessThanOrEqual(1);
        }
      },
      { settings: { "ext.pi-subagents": { maxConcurrent: 1, maxQueued: 2 } } }
    );
  }, 30_000);
});
