import { readFile, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test as caseTest, vi } from "vite-plus/test";
import { z } from "zod";

import { DEPTH_ENV, RESULT_MESSAGE, RUN_ENTRY, TASK_ID_ENV } from "../src/constants.ts";
import { detailsSchema } from "../src/result.ts";
import { runRecordSchema, taskRecordSchema } from "../src/tasks/records.ts";
import {
  descendantStarted,
  expectChildUsageOnce,
  fixture,
  LONG_GRACE_LIMIT,
  taskList,
  withFixture
} from "./background-fixture.ts";
import { fixtureProcesses, killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

/** The PIDs of fixture processes whose environment sets `name` to `value`. */
async function processesWith(directory: string, name: string, value: string): Promise<number[]> {
  const found = await Promise.all(
    (await fixtureProcesses(directory)).map(async ({ pid }) => {
      // A process can exit after the listing.
      const environment = await readFile(`/proc/${pid}/environ`, "utf8").catch(() => "");

      return environment.split("\0").includes(`${name}=${value}`) ? [pid] : [];
    })
  );

  return found.flat();
}

test("delivers background results in a child after a final error without retry", async () => {
  await fixture(async (host) => {
    await host.prompt("nested-error");
    const result = (await host.results()).at(-1)!;
    expect(detailsSchema.parse(result.details).state).toBe("completed");
    expect(contentText(result.content)).toContain("background results 1");
  });
});

test("settles a child only after its background grandchild result is consumed", async () => {
  await fixture(async (host) => {
    await host.prompt("nested-background");
    const result = (await host.results()).at(-1)!;
    expect(detailsSchema.parse(result.details).state).toBe("completed");
    expect(contentText(result.content)).toContain("background results 1");
    expect(contentText(result.content)).toContain("Fixture reply");
    const supervisorEntries = await host.entries();
    expect(
      supervisorEntries.filter(
        (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
      )
    ).toHaveLength(0);
    // The child counts its grandchild's late usage, so the root receives it with the child's.
    const child = (await taskList(host)).find(
      (task) => task.task_id === detailsSchema.parse(result.details).task_id
    )!;
    const entries = parseSessionEntries(await readFile(child.session_file, "utf8"));
    expectChildUsageOnce(entries, 1);
    // Three child requests and one grandchild request each use 15 tokens and cost 0.001.
    expect(result.usage).toMatchObject({ totalTokens: 60, cost: { total: 0.004 } });
    // The run's recorded usage includes the late usage that the child counted.
    expect(child.usage).toEqual({
      input: 40,
      output: 20,
      cache_read: 0,
      cache_write: 0,
      cost: 0.004
    });
  });
});

test("rejects nested capacity immediately and observes registration depth", async () => {
  await fixture(async (host) => {
    await host.prompt("nested-capacity");
    expect(contentText((await host.results()).at(-1)!.content)).toContain(
      "capacity reached (1 subagents running); do the work yourself"
    );
    await host.prompt("delegate-reply");
    expect(detailsSchema.parse((await host.results()).at(-1)!.details).state).toBe("completed");
  }, 1);
  await fixture(async (host) => {
    await host.prompt("nested-depth");
    expect(contentText((await host.results()).at(-1)!.content)).toContain(
      "subagent available: false"
    );
    await host.prompt("nested-failure");
    const recovered = contentText((await host.results()).at(-1)!.content);
    expect(recovered).toContain("new_session failed");
    expect(recovered).toContain("Fixture reply");
    expect(recovered).not.toContain("capacity reached");
  }, 2);
});

test("retains the child depth limit after reloading extensions", async () => {
  const directory = await createFixtureWorkspace();
  const host = await Supervisor.start(directory, { depth: 2 });

  try {
    await host.prompt("report-tools");
    await host.request({ type: "prompt", message: "/fixture-reload" });
    await host.prompt("report-tools");
    const response = await host.request({ type: "get_last_assistant_text" });
    expect(response.command === "get_last_assistant_text" ? response.data.text : "").toBe(
      "subagent available: false"
    );
  } finally {
    await host.stop();
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked).toEqual([]);
  }
});

test("retains the child depth limit when a child session resumes", async () => {
  await withFixture(async (_directory, start) => {
    const subagentTools = async (host: Supervisor) => {
      await host.prompt("report-subagent-tools");
      const response = await host.request({ type: "get_last_assistant_text" });

      return response.command === "get_last_assistant_text" ? response.data.text : "";
    };

    const first = await start({ depth: 1 });
    expect(await subagentTools(first)).toBe("subagent tools: true true");
    const { sessionId } = await first.state();
    await first.stop();
    // Children resume with `--session` and no `--tools`, so Pi restores the recorded tools.
    const below = await start({ sessionId, depth: 1 });
    expect(await subagentTools(below)).toBe("subagent tools: true true");
    await below.stop();
    const atLimit = await start({ sessionId, depth: 2 });
    expect(await subagentTools(atLimit)).toBe("subagent tools: false false");
  });
});

test.for(["user abort", "turn abort", "shutdown", "SIGKILL", "blocked shutdown"])(
  "stops a settling subtree on %s",
  async (action, { expect }) => {
    // With these limits, a graceful stop of the stubborn grandchild outlasts a step.
    const limit = action === "turn abort" ? LONG_GRACE_LIMIT : undefined;
    await fixture(
      async (host, directory) => {
        const work = host
          .prompt(
            action === "blocked shutdown" || action === "turn abort"
              ? "nested-stubborn"
              : "nested-slow"
          )
          .catch((error: unknown) => error);
        await descendantStarted(host, expect);

        if (action === "blocked shutdown" || action === "turn abort") {
          // Wait until the grandchild has started its shutdown-blocking scenario.
          for (let index = 0; index < STEP_TIMEOUT_MS / 25; index++) {
            const processes = await remainingProcesses(directory, 0);
            if (processes.some((process) => process.command.includes("sleep 600"))) break;
            if (index === STEP_TIMEOUT_MS / 25 - 1)
              throw new Error("Stubborn descendant did not start");
            await setTimeout(25);
          }
        }

        if (action === "turn abort") {
          const abort = host.request({ type: "abort" });
          // Only an immediate stop ends the subtree within this wait. Observe exit, not only a kill
          // request.
          await expect
            .poll(
              async () =>
                (await fixtureProcesses(directory)).filter(
                  ({ pid }) => pid !== host.connection.process.pid
                ),
              { timeout: STEP_TIMEOUT_MS }
            )
            .toEqual([]);
          await abort;
        } else if (action === "SIGKILL") host.connection.process.kill("SIGKILL");
        else if (action === "shutdown") host.connection.closeInput();
        else {
          const page = z
            .object({ tasks: z.array(taskRecordSchema) })
            .parse(JSON.parse((await host.command("list")).message));
          await host.command(`abort ${page.tasks[0]!.task_id}`);
        }

        await work;

        if (action === "shutdown" || action === "SIGKILL") {
          await host.connection.closed;
          expect(await remainingProcesses(directory)).toEqual([]);
        } else {
          const page = z
            .object({ tasks: z.array(taskRecordSchema) })
            .parse(JSON.parse((await host.command("list")).message));
          expect(page.tasks.every((task) => task.state === "inactive")).toBe(true);
        }
      },
      limit ?? 4,
      limit ?? 2
    );
  }
);

test("routes nested dialogs and reconstructs descendant ownership after restart", async () => {
  await fixture(async (host, directory) => {
    const work = host.prompt("nested-dialog");
    const dialog = await host.wait(
      (event) => event.type === "extension_ui_request" && event.method === "confirm"
    );
    if (dialog.type !== "extension_ui_request" || dialog.method !== "confirm")
      throw new Error("No nested dialog");
    expect(dialog.title).toContain(
      "[subagent: Fixture nested-dialog] [subagent: Fixture dialog task]"
    );
    await host.connection.respond({
      type: "extension_ui_response",
      id: dialog.id,
      confirmed: true
    });
    await work;
    expect(contentText((await host.results())[0]!.content)).toContain("Dialog accepted");
    const page = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message));
    expect(page.tasks).toHaveLength(2);
    expect(page.tasks[1]?.parent_task_id).toBe(page.tasks[0]?.task_id);
    const state = await host.state();
    await host.stop();
    const resumed = await Supervisor.start(directory, { sessionId: state.sessionId });

    try {
      expect(JSON.parse((await resumed.command("list")).message)).toMatchObject({
        tasks: page.tasks
      });
      expect((await resumed.command(`abort ${page.tasks[1]!.task_id}`)).notifyType).toBe("error");
    } finally {
      await resumed.stop();
    }
  });
});

test("keeps earlier descendants and shows no starting descendant as stopped while its owner runs", async ({
  expect
}) => {
  await fixture(
    async (host, directory) => {
      await host.prompt("nested-background");
      const { sessionId } = await host.state();
      await host.stop();
      // After a restart, the supervisor knows the earlier descendant only from the owner's file.
      const restarted = await Supervisor.start(directory, { sessionId });

      try {
        const [owner, earlier] = await taskList(restarted);
        expect(earlier).toMatchObject({ parent_task_id: owner!.task_id, outcome: "completed" });
        // The resumed owner starts a child, and the child starts a grandchild.
        const work = restarted.prompt(`extend-id ${owner!.task_id}`);
        await expect
          .poll(async () => (await processesWith(directory, DEPTH_ENV, "3")).length, {
            timeout: STEP_TIMEOUT_MS,
            interval: 5
          })
          .toBeGreaterThan(0);
        // The grandchild's live record can reach the supervisor only through the owner.
        const [pid] = await processesWith(directory, TASK_ID_ENV, owner!.task_id);
        process.kill(pid!, "SIGSTOP");
        let childId: string | undefined;
        let grandchild: string | undefined;

        try {
          const child = (await taskList(restarted)).find(
            (task) => task.parent_task_id === owner!.task_id && task.state === "active"
          )!;
          childId = child.task_id;

          grandchild = await vi.waitFor(
            async () => {
              const run = parseSessionEntries(await readFile(child.session_file, "utf8")).find(
                (entry) => entry.type === "custom" && entry.customType === RUN_ENTRY
              );
              if (run?.type !== "custom") throw new Error("The child file names no grandchild");

              return runRecordSchema.parse(run.data).task_id;
            },
            { timeout: STEP_TIMEOUT_MS, interval: 10 }
          );

          // The child's file names the grandchild before the grandchild's live record arrives.
          const tasks = await taskList(restarted);
          expect(
            tasks.filter((task) => task.state === "inactive" && task.ended_at === null)
          ).toEqual([]);
          expect(tasks.find((task) => task.task_id === earlier!.task_id)).toEqual(earlier);
          expect(tasks.some((task) => task.task_id === grandchild)).toBe(false);
        } finally {
          process.kill(pid!, "SIGCONT");
        }

        await work;
        const tasks = await taskList(restarted);
        expect(tasks.find((task) => task.task_id === earlier!.task_id)).toEqual(earlier);
        expect(tasks.find((task) => task.task_id === grandchild)).toMatchObject({
          parent_task_id: childId,
          outcome: "completed"
        });
      } finally {
        await restarted.stop();
      }
    },
    4,
    3
  );
});

test("routes promotion to the owner and frees subtree capacity for queued top-level work", async ({
  expect
}) => {
  await fixture(async (host) => {
    const initial = host.reply("nested-foreground");
    await descendantStarted(host, expect);
    const page = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message));
    const [child, grandchild] = page.tasks;
    expect(page.tasks).toHaveLength(2);
    expect((await host.command(`background ${grandchild!.task_id}`)).notifyType).toBe("info");
    const promoted = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message));
    expect(promoted.tasks[1]).toMatchObject({ task_id: grandchild!.task_id, background: true });
    await host.command(`background ${child!.task_id}`);
    await initial;
    const after = host.records.length;
    const queued = host.prompt("delegate-reply");
    await host.wait(
      (event) =>
        event.type === "tool_execution_update" &&
        z.object({ details: detailsSchema }).safeParse(event.partialResult).data?.details.state ===
          "queued",
      after
    );
    expect(
      z.object({ total: z.number() }).parse(JSON.parse((await host.command("list")).message)).total
    ).toBe(2);
    await host.command(`abort ${child!.task_id}`);
    await queued;
    const result = (await host.results()).at(-1)!;
    expect(detailsSchema.parse(result.details).state).toBe("completed");
    const records = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message));
    expect(records.tasks).toHaveLength(3);
    expect(records.tasks.every((task) => task.state === "inactive")).toBe(true);
  }, 2);
});
