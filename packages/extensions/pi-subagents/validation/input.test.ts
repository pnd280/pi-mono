import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test as caseTest } from "vite-plus/test";
import { z } from "zod";

import { RESULT_MESSAGE } from "../src/constants.ts";
import { detailsSchema } from "../src/result.ts";
import { release, taskList, withFixture } from "./background-fixture.ts";
import type { Supervisor } from "./supervisor.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

async function ready(path: string): Promise<void> {
  for (let index = 0; index < STEP_TIMEOUT_MS / 25; index++) {
    try {
      await readFile(path);

      return;
    } catch {
      await setTimeout(25);
    }
  }

  throw new Error("Fixture boundary was not reached");
}

/**
 * Sends an update, then creates `run-release` when its result arrives. Held children and owners
 * keep running until then, so the update reaches them while they run or settle.
 */
async function sendUpdate(host: Supervisor, directory: string, message: string): Promise<void> {
  const after = host.records.length;
  const work = host.prompt(message);
  await host.wait(
    (record) =>
      record.type === "message_end" &&
      record.message.role === "toolResult" &&
      record.message.toolName === "subagent",
    after
  );
  await release(directory, "run-release");
  await work;
}

test.each(["follow_up", "steer", "settling", "exiting"] as const)(
  "preserves input and usage through %s delivery",
  async (mode) => {
    await withFixture(
      async (directory, start) => {
        const host = await start();
        const scenario = mode === "settling" || mode === "exiting" ? mode : "input";
        await host.reply(`background-${scenario}`);
        const initial = (await host.results())[0]!;
        const id = detailsSchema.parse(initial.details).task_id!;
        if (mode === "settling") await ready(`${directory}/work/settle-ready`);
        if (mode === "exiting") await ready(`${directory}/work/exit-ready`);
        const message = `update-id ${id} ${mode === "steer" ? "steer" : "follow_up"}`;
        // The settling child holds its settle hook until the input arrives.
        if (mode === "settling") await host.prompt(message);
        else if (mode === "exiting") {
          // The exiting child holds its shutdown until the supervisor's call has started. The
          // supervisor routes the input before its next step, so the input meets the exit.
          const after = host.records.length;
          const work = host.prompt(message);
          await host.wait(
            (record) => record.type === "tool_execution_start" && record.toolName === "subagent",
            after
          );
          await release(directory, "exit-release");
          await work;
        } else await sendUpdate(host, directory, message);
        const update = (await host.results()).at(-1)!;
        expect(detailsSchema.parse(update.details).task_id).toBe(id);
        if (mode !== "exiting") {
          expect(contentText(update.content)).toContain("Background task updated");
          expect(update.usage).toBeUndefined();
        } else
          expect(contentText(update.content)).toContain(
            "Input occurrences: 1; earlier context: true"
          );
        if (mode !== "exiting")
          await host.wait(
            (event) =>
              event.type === "message_end" &&
              event.message.role === "custom" &&
              event.message.customType === RESULT_MESSAGE
          );
        const entries = await host.entries();
        const completions = entries.filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        );
        expect(completions).toHaveLength(1);
        expect(
          completions[0]?.type === "custom_message"
            ? detailsSchema.parse(completions[0].details).usage
            : undefined
        ).toMatchObject({
          input: mode === "exiting" ? 10 : 20,
          output: mode === "exiting" ? 5 : 10
        });
        if (mode === "exiting") expect(update.usage).toMatchObject({ input: 10, output: 5 });
        // The reply that the input followed stays in the result, before the input's reply.
        if (mode !== "exiting")
          expect(
            completions[0]?.type === "custom_message" ? contentText(completions[0].content) : ""
          ).toMatch(
            /Choose a subagents fixture scenario\.\s+Input occurrences: 1; earlier context: true/
          );
        const tasks = await taskList(host);
        expect(tasks).toHaveLength(1);
        const session = await readFile(tasks[0]!.session_file, "utf8");
        const messages = session
          .trim()
          .split("\n")
          .map((line) =>
            z
              .object({
                type: z.string(),
                message: z.object({ role: z.string(), content: z.unknown() }).optional()
              })
              .parse(JSON.parse(line))
          );
        expect(
          messages.filter(
            (entry) =>
              entry.message?.role === "user" &&
              JSON.stringify(entry.message.content).includes("input-payload")
          )
        ).toHaveLength(1);
      },
      {
        settings: { "ext.pi-subagents": { maxConcurrent: 1 } }
      }
    );
  }
);

test.for(["stopped", "live"])(
  "routes input to its owner, and only the owner resumes an inactive descendant of a %s owner",
  async (mode, { expect }) => {
    await withFixture(async (directory, start) => {
      let host = await start();
      const page = () => taskList(host);
      await host.reply(mode === "live" ? "background-owner-live" : "background-owner");
      await expect
        .poll(async () => (await page()).find((task) => task.parent_task_id !== null)?.state, {
          timeout: STEP_TIMEOUT_MS
        })
        .toBe(mode === "live" ? "inactive" : "active");
      const [owner, child] = await page();
      expect(child?.parent_task_id).toBe(owner!.task_id);
      if (mode === "stopped") {
        await sendUpdate(host, directory, `update-id ${child!.task_id} follow_up`);
        const update = (await host.results()).at(-1)!;
        expect(contentText(update.content)).toContain("Background task updated");
        expect(update.usage).toBeUndefined();
        await host.wait(
          (event) =>
            event.type === "message_end" &&
            event.message.role === "custom" &&
            event.message.customType === RESULT_MESSAGE
        );
        const completion = (await host.entries()).filter(
          (entry) => entry.type === "custom_message" && entry.customType === RESULT_MESSAGE
        );
        expect(completion).toHaveLength(1);
        expect(
          completion[0]?.type === "custom_message" ? contentText(completion[0].content) : ""
        ).toContain("Input occurrences: 1; earlier context: true");
        await expect
          .poll(async () => (await page())[0]?.state, { timeout: STEP_TIMEOUT_MS })
          .toBe("inactive");
      } else expect((await page())[0]?.state).toBe("active");
      const saved = await readFile(child!.session_file, "utf8");
      // A live owner stays active until this update's result arrives.
      await sendUpdate(host, directory, `update-id ${child!.task_id} follow_up`);
      const rejected = (await host.results()).at(-1)!;
      expect(rejected.isError).toBe(true);
      expect(contentText(rejected.content)).toContain("Only direct tasks can be resumed");
      expect(await readFile(child!.session_file, "utf8")).toBe(saved);
      if (mode === "live")
        await host.wait(
          (event) =>
            event.type === "message_end" &&
            event.message.role === "custom" &&
            event.message.customType === RESULT_MESSAGE
        );
      const state = await host.state();
      await host.stop();
      host = await start({ sessionId: state.sessionId });
      expect((await page()).find((task) => task.task_id === child!.task_id)?.parent_task_id).toBe(
        owner!.task_id
      );
      const foreign = await start();

      try {
        await foreign.prompt(`update-id ${child!.task_id} steer`);
        expect((await foreign.results())[0]?.isError).toBe(true);
      } finally {
        await foreign.stop();
      }

      expect(await readFile(child!.session_file, "utf8")).toBe(saved);
      await host.prompt(`owner-resume ${owner!.task_id} ${child!.task_id}`);
      expect(contentText((await host.results()).at(-1)!.content)).toContain(
        `Input occurrences: ${mode === "live" ? 1 : 2}`
      );
      expect((await readFile(child!.session_file, "utf8")).startsWith(saved)).toBe(true);
    });
  }
);
