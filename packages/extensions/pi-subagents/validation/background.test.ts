import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

import { contentText } from "@earendil-works/pi-ai";
import { parseSessionEntries, type FileEntry } from "@earendil-works/pi-coding-agent";
import { expect, test as caseTest } from "vite-plus/test";
import { z } from "zod";

import type { RpcRecord } from "../src/connection.ts";
import { LATE_USAGE_KIND, RESULT_MESSAGE, RUN_ENTRY, TASKS_MESSAGE } from "../src/constants.ts";
import { runRecordSchema, taskRecordSchema } from "../src/records.ts";
import { detailsSchema, type ToolDetails } from "../src/result.ts";
import { remainingProcesses, killFixtureProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

const test = caseTest.skipIf(process.platform !== "linux");

async function fixture(
  body: (host: Supervisor, directory: string) => Promise<void>,
  maxConcurrent = 4,
  maxDepth = 2,
  settings: Record<string, unknown> = {}
) {
  const directory = await createFixtureWorkspace({
    settings: { "ext.pi-subagents": { maxConcurrent, maxDepth }, ...settings }
  });
  const host = await Supervisor.start(directory);

  try {
    await body(host, directory);
  } finally {
    await host.stop();
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked).toEqual([]);
  }
}

function tokens(usage: ToolDetails["usage"]): number {
  return usage.input + usage.output + usage.cache_read + usage.cache_write;
}

/** Each background child's usage reaches the totals once: returned with the call, the rest late. */
function expectChildUsageOnce(entries: readonly FileEntry[], count: number): void {
  let returned = 0;
  let late = 0;
  let full = 0;
  const usage = entries.filter((entry) => entry.type === "usage");

  for (const entry of entries) {
    if (
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "subagent"
    )
      returned += entry.message.usage?.totalTokens ?? 0;
    if (entry.type === "usage" && entry.kind === LATE_USAGE_KIND) late += entry.usage.totalTokens;
    if (entry.type === "custom_message" && entry.customType === RESULT_MESSAGE)
      full += tokens(detailsSchema.parse(entry.details).usage);
  }

  expect(usage).toHaveLength(count);
  expect(late).toBeGreaterThan(0);
  expect(returned + late).toBe(full);
}

test.each(["idle", "busy"])(
  "delivers one background completion with prepared %s context",
  async (mode) => {
    await fixture(async (host) => {
      await host.prompt(`background-${mode}`);
      const initial = (await host.results())[0]!;
      expect(detailsSchema.parse(initial.details)).toMatchObject({
        background: true,
        state: "running"
      });
      const completion = await host.wait(
        (record) =>
          record.type === "message_end" &&
          record.message.role === "custom" &&
          record.message.customType === RESULT_MESSAGE
      );
      expect(completion.type).toBe("message_end");
      // The supervisor waits for the result, so both cases continue the same run.
      await host.wait(
        (record) =>
          record.type === "message_end" &&
          record.message.role === "assistant" &&
          contentText(record.message.content).includes("background results 1")
      );
      const entries = await host.entries();
      expect(
        entries.filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        )
      ).toHaveLength(1);
      expectChildUsageOnce(entries, 1);
    });
  },
  30_000
);

test("counts late usage once after reloading extensions", async () => {
  await fixture(async (host) => {
    await host.request({ type: "prompt", message: "/fixture-reload" });
    await host.prompt("background-idle");
    await host.wait(
      (record) =>
        record.type === "message_end" &&
        record.message.role === "assistant" &&
        contentText(record.message.content).includes("background results 1")
    );
    expectChildUsageOnce(await host.entries(), 1);
  });
}, 30_000);

function isResult(record: RpcRecord): boolean {
  return (
    record.type === "message_end" &&
    record.message.role === "custom" &&
    record.message.customType === RESULT_MESSAGE
  );
}

function replies(text: string): (record: RpcRecord) => boolean {
  return (record) =>
    record.type === "message_end" &&
    record.message.role === "assistant" &&
    contentText(record.message.content).includes(text);
}

async function taskList(host: Supervisor) {
  return z
    .object({ tasks: z.array(taskRecordSchema) })
    .parse(JSON.parse((await host.command("list")).message)).tasks;
}

/** Descendant records reach the supervisor in memory, through the child's updates. */
async function descendantStarted(host: Supervisor): Promise<void> {
  await expect
    .poll(async () => (await taskList(host)).some((task) => task.parent_task_id !== null), {
      timeout: 10_000,
      interval: 25
    })
    .toBe(true);
}

test("continues after the first background result while a slower task runs", async () => {
  await fixture(async (host) => {
    const start = host.records.length;
    await host.prompt("background-pair");
    const records = host.records.slice(start);
    const first = records.findIndex(replies("background results 1"));
    const results = records.flatMap((record, index) => (isResult(record) ? [index] : []));
    expect(results).toHaveLength(2);
    expect(first).toBeGreaterThan(results[0]!);
    expect(first).toBeLessThan(results[1]!);
    expect(records.findIndex(replies("background results 2"))).toBeGreaterThan(results[1]!);
    expect(records.filter((record) => record.type === "agent_settled")).toHaveLength(1);
    expect(
      (await host.entries()).filter(
        (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
      )
    ).toHaveLength(2);
  });
}, 30_000);

test("ends a background wait on abort and delivers the later result when idle", async () => {
  await fixture(async (host) => {
    await host.reply("background-late");
    const start = host.records.length;
    await host.request({ type: "abort" });
    await host.wait((record) => record.type === "agent_settled", start);
    expect((await taskList(host))[0]?.state).toBe("active");
    await host.wait(isResult, start);
    await host.wait(replies("Idle continuation prepared: true"), start);
    expectChildUsageOnce(await host.entries(), 1);
  });
}, 30_000);

test.each(["followUp", "steer"] as const)(
  "processes %s input during a background wait at once",
  async (streamingBehavior) => {
    await fixture(async (host) => {
      await host.reply("background-late");
      const start = host.records.length;
      await host.request({ type: "prompt", message: "reply", streamingBehavior });
      await host.wait(replies("Fixture reply"), start);
      expect(host.records.slice(start).some(isResult)).toBe(false);
      await host.wait(isResult, start);
      await host.wait((record) => record.type === "agent_settled", start);
      expect(
        (await host.entries()).filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        )
      ).toHaveLength(1);
    });
  },
  30_000
);

test("delivers background results in a child after a final error without retry", async () => {
  await fixture(async (host) => {
    await host.prompt("nested-error");
    const result = (await host.results()).at(-1)!;
    expect(detailsSchema.parse(result.details).state).toBe("completed");
    expect(contentText(result.content)).toContain("background results 1");
  });
}, 30_000);

test("retries a failed reply without waiting for background tasks", async () => {
  await fixture(
    async (host) => {
      const start = host.records.length;
      await host.prompt("background-retry");
      const records = host.records.slice(start);
      const retry = records.findIndex((record) => record.type === "auto_retry_start");
      const reply = records.findIndex(replies("background results 0"));
      expect(retry).toBeGreaterThanOrEqual(0);
      expect(reply).toBeGreaterThan(retry);
      expect(reply).toBeLessThan(records.findIndex(isResult));
      expect(records.findIndex(replies("background results 1"))).toBeGreaterThan(reply);
    },
    4,
    2,
    { retry: { enabled: true, maxRetries: 1, baseDelayMs: 10 } }
  );
}, 30_000);

test("aborts an owned task without its result and resumes it later", async () => {
  await fixture(async (host) => {
    await host.reply("background-slow");
    const [task] = await taskList(host);
    const aborts = async () =>
      (await host.entries()).flatMap((entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "subagent_abort"
          ? [entry.message]
          : []
      );
    // The input ends the wait; the run then ends without a remaining task.
    await host.prompt(`abort-id ${task!.task_id}`);
    const aborted = (await aborts()).at(-1)!;
    expect(aborted.isError).toBe(false);
    expect(detailsSchema.parse(aborted.details)).toMatchObject({
      task_id: task!.task_id,
      state: "cancelled"
    });
    expect((await taskList(host))[0]).toMatchObject({ state: "inactive", outcome: "cancelled" });
    await setTimeout(500);
    expect(host.records.some(isResult)).toBe(false);
    await host.prompt(`abort-id ${task!.task_id}`);
    expect(contentText((await aborts()).at(-1)!.content)).toContain("Task is inactive");
    await host.prompt("abort-id 00000000-0000-0000-0000-000000000000");
    expect(contentText((await aborts()).at(-1)!.content)).toContain(
      "Task does not belong to this session"
    );
    // One slot proves that the abort released capacity.
    await host.prompt(`history-id ${task!.task_id}`);
    expect(detailsSchema.parse((await host.results()).at(-1)!.details)).toMatchObject({
      task_id: task!.task_id,
      state: "completed"
    });
  }, 1);
}, 30_000);

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
}, 30_000);

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
}, 30_000);

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
}, 30_000);

test("promotes foreground work, retains it across turn abort, and counts late usage once", async () => {
  await fixture(async (host) => {
    const work = host.prompt("promote-pair").catch((error: unknown) => error);
    const record = await host.wait(
      (event) =>
        event.type === "entry_appended" &&
        event.entry.type === "custom" &&
        event.entry.customType === RUN_ENTRY &&
        runRecordSchema.safeParse(event.entry.data).data?.description === "Promote after usage"
    );
    if (record.type !== "entry_appended" || record.entry.type !== "custom")
      throw new Error("No task record");
    const task = runRecordSchema.parse(record.entry.data);
    await host.wait(
      (event) =>
        event.type === "tool_execution_update" &&
        z.object({ details: detailsSchema }).safeParse(event.partialResult).data?.details
          .activity === "read"
    );
    await host.command(`background ${task.task_id}`);
    const returned = await host.wait(
      (event) =>
        event.type === "tool_execution_end" &&
        z.object({ details: detailsSchema }).safeParse(event.result).data?.details.task_id ===
          task.task_id
    );
    if (returned.type !== "tool_execution_end") throw new Error("No promoted result");
    expect(z.object({ details: detailsSchema }).parse(returned.result).details).toMatchObject({
      state: "running",
      background: true
    });
    await host.request({ type: "abort" });
    await work;
    const result = (await host.results()).find(
      (item) => detailsSchema.safeParse(item.details).data?.task_id === task.task_id
    )!;
    expect(result.usage?.totalTokens).toBe(15);
    const page = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message));
    expect(page.tasks.find((item) => item.task_id === task.task_id)).toMatchObject({
      state: "active",
      background: true
    });
    await host.wait(
      (event) =>
        event.type === "message_end" &&
        event.message.role === "custom" &&
        event.message.customType === RESULT_MESSAGE
    );
    await host.wait(
      (event) =>
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        contentText(event.message.content).includes("Idle continuation prepared: true")
    );
    const entries = await host.entries();
    const completion = entries.find(
      (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
    );
    if (completion?.type !== "custom_message") throw new Error("No completion");
    const details = detailsSchema.parse(completion.details);
    // The card keeps the full run usage; only the part after the return is counted again.
    expect(details.usage.input).toBe(20);
    expect(details.late_usage?.usage).toMatchObject({ totalTokens: 15, cost: { total: 0.001 } });
    const late = entries.filter((entry) => entry.type === "usage");
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({
      kind: LATE_USAGE_KIND,
      usage: { input: 10, output: 5, totalTokens: 15, cost: { total: 0.001 } }
    });
    expect(late[0]?.type === "usage" ? `${late[0].provider}/${late[0].model}` : "").toBe(
      details.model
    );
    // Supervisor 30 + returned 15 + late 15.
    expect((await host.stats()).tokens.total).toBe(60);
  });
}, 30_000);

test.each([
  ["print", "background-idle", 1],
  ["json", "background-idle", 1],
  ["print", "background-pair", 2],
  ["json", "background-pair", 2],
  ["print", "background-error", 1],
  ["json", "background-error", 1]
] as const)(
  "consumes each background completion before %s exits after %s",
  async (mode, scenario, count) => {
    const directory = await createFixtureWorkspace();

    try {
      const launch = await fixtureLaunch(directory);
      const child = promisify(execFile)(
        launch.command,
        [
          ...launch.args,
          "--print",
          ...(mode === "json" ? ["--mode", "json"] : []),
          "--session",
          `${directory}/supervisor.jsonl`,
          scenario
        ],
        { ...launch.options, timeout: 15000 }
      );
      child.child.stdin?.end();
      const { stdout } = await child;
      expect(stdout).toContain(`background results ${count}`);
      const entries = parseSessionEntries(await readFile(`${directory}/supervisor.jsonl`, "utf8"));
      expect(
        entries.filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        )
      ).toHaveLength(count);
      expectChildUsageOnce(entries, count);
      expect(await remainingProcesses(directory)).toEqual([]);
    } finally {
      await killFixtureProcesses(directory);
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000
);

test.each(["user abort", "turn abort", "shutdown", "SIGKILL", "blocked shutdown"])(
  "stops a settling subtree on %s",
  async (action) => {
    await fixture(async (host, directory) => {
      const work = host
        .prompt(
          action === "blocked shutdown" || action === "turn abort"
            ? "nested-stubborn"
            : "nested-slow"
        )
        .catch((error: unknown) => error);
      await descendantStarted(host);

      if (action === "blocked shutdown" || action === "turn abort") {
        // Wait until the grandchild has started its shutdown-blocking scenario.
        for (let index = 0; index < 200; index++) {
          const processes = await remainingProcesses(directory, 0);
          if (processes.some((process) => process.command.includes("sleep 600"))) break;
          if (index === 199) throw new Error("Stubborn descendant did not start");
          await setTimeout(25);
        }
      }

      if (action === "turn abort") {
        const abort = host.request({ type: "abort" });
        // The old grace period exceeds five seconds. Observe exit, not only a kill request.
        expect(
          (await remainingProcesses(directory, 2000)).filter(
            ({ pid }) => pid !== host.connection.process.pid
          )
        ).toEqual([]);
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
    });
  },
  30_000
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
}, 30_000);

test("routes promotion to the owner and frees subtree capacity for queued top-level work", async () => {
  await fixture(async (host) => {
    const initial = host.reply("nested-foreground");
    await descendantStarted(host);
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
}, 30_000);

test("keeps direct task identities in context after compaction without a new turn", async () => {
  await fixture(async (host) => {
    await host.prompt("delegate-reply");
    const taskId = detailsSchema.parse((await host.results())[0]!.details).task_id!;
    await host.prompt("reply");
    const start = host.records.length;
    await host.request({ type: "compact" });
    const reminders = (await host.entries()).filter(
      (entry) => entry.type === "custom_message" && entry.customType === TASKS_MESSAGE
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ display: false });
    const reminder = reminders[0];
    expect(reminder?.type === "custom_message" ? reminder.content : "").toContain(taskId);
    expect(host.records.slice(start).some((record) => record.type === "agent_start")).toBe(false);
    await host.prompt("report-context");
    const text = await host.request({ type: "get_last_assistant_text" });
    expect(text.command === "get_last_assistant_text" ? text.data.text : "").toContain(taskId);
  });
}, 30_000);
