import { contentText } from "@earendil-works/pi-ai";
import { expect, test as caseTest } from "vite-plus/test";
import { z } from "zod";

import { LATE_USAGE_KIND, RESULT_MESSAGE, RUN_ENTRY, TASKS_MESSAGE } from "../src/constants.ts";
import { detailsSchema } from "../src/result.ts";
import { runRecordSchema, taskRecordSchema } from "../src/tasks/records.ts";
import {
  expectChildUsageOnce,
  fixture,
  isResult,
  release,
  replies,
  taskList
} from "./background-fixture.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

test.each([
  ["idle", "turn_end"],
  ["busy", "settle"]
] as const)(
  "delivers one background completion with prepared %s context and %s delivery",
  async (mode, resultDelivery) => {
    await fixture(
      async (host) => {
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
        // Both cases continue the same run: idle after the `agent_end` wait, busy at settlement.
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
      },
      4,
      2,
      { "ext.pi-subagents": { maxConcurrent: 4, maxDepth: 2, resultDelivery } }
    );
  }
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
});

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
});

test("ends a background wait on abort and delivers the later result when idle", async () => {
  await fixture(async (host, directory) => {
    await host.reply("background-late");
    const start = host.records.length;
    await host.request({ type: "abort" });
    await host.wait((record) => record.type === "agent_settled", start);
    expect((await taskList(host))[0]?.state).toBe("active");
    await release(directory, "run-release");
    await host.wait(isResult, start);
    await host.wait(replies("Idle continuation prepared: true"), start);
    expectChildUsageOnce(await host.entries(), 1);
  });
});

test.each(["followUp", "steer"] as const)(
  "processes %s input during a background wait at once",
  async (streamingBehavior) => {
    await fixture(async (host, directory) => {
      await host.reply("background-late");
      const start = host.records.length;
      await host.request({ type: "prompt", message: "reply", streamingBehavior });
      await host.wait(replies("Fixture reply"), start);
      expect(host.records.slice(start).some(isResult)).toBe(false);
      await release(directory, "run-release");
      await host.wait(isResult, start);
      await host.wait((record) => record.type === "agent_settled", start);
      expect(
        (await host.entries()).filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        )
      ).toHaveLength(1);
    });
  }
);

test("retries a failed reply without waiting for background tasks", async () => {
  await fixture(
    async (host, directory) => {
      const start = host.records.length;
      const work = host.prompt("background-retry");
      await host.wait(replies("background results 0"), start);
      await release(directory, "run-release");
      await work;
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
});

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
    // The abort returned after the task's completion; a result would reach the following runs.
    expect(host.records.some(isResult)).toBe(false);
  }, 1);
});

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
});

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
});
