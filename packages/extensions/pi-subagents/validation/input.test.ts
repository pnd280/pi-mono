import { readFile, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { contentText } from "@earendil-works/pi-ai";
import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { RESULT_MESSAGE } from "../src/constants.ts";
import { taskRecordSchema } from "../src/records.ts";
import { detailsSchema } from "../src/result.ts";
import { remainingProcesses, killFixtureProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

async function ready(path: string): Promise<void> {
  for (let index = 0; index < 200; index++) {
    try {
      await readFile(path);

      return;
    } catch {
      await setTimeout(25);
    }
  }

  throw new Error("Fixture boundary was not reached");
}

test.skipIf(process.platform !== "linux").each(["follow_up", "steer", "settling", "exiting"])(
  "preserves input and usage through %s delivery",
  async (mode) => {
    const directory = await createFixtureWorkspace({
      settings: { "ext.pi-subagents": { maxConcurrent: 1 } }
    });
    const host = await Supervisor.start(directory);

    try {
      const scenario = ["settling", "exiting"].includes(mode) ? mode : "input";
      await host.reply(`background-${scenario}`);
      const initial = (await host.results())[0]!;
      const id = detailsSchema.parse(initial.details).task_id!;
      if (mode === "settling") await ready(`${directory}/work/settle-ready`);
      if (mode === "exiting") await ready(`${directory}/work/exit-ready`);
      await host.prompt(`update-id ${id} ${mode === "steer" ? "steer" : "follow_up"}`);
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
      ).toMatchObject({ input: mode === "exiting" ? 10 : 20, output: mode === "exiting" ? 5 : 10 });
      if (mode === "exiting") expect(update.usage).toMatchObject({ input: 10, output: 5 });
      // The reply that the input followed stays in the result, before the input's reply.
      if (mode !== "exiting")
        expect(
          completions[0]?.type === "custom_message" ? contentText(completions[0].content) : ""
        ).toMatch(
          /Choose a subagents fixture scenario\.\s+Input occurrences: 1; earlier context: true/
        );
      const page = z
        .object({ tasks: z.array(taskRecordSchema) })
        .parse(JSON.parse((await host.command("list")).message));
      expect(page.tasks).toHaveLength(1);
      const session = await readFile(page.tasks[0]!.session_file, "utf8");
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

test.skipIf(process.platform !== "linux").each(["stopped", "live"])(
  "routes input to its owner, and only the owner resumes an inactive descendant of a %s owner",
  async (mode) => {
    const directory = await createFixtureWorkspace();
    let host = await Supervisor.start(directory);
    const page = async () =>
      z
        .object({ tasks: z.array(taskRecordSchema) })
        .parse(JSON.parse((await host.command("list")).message)).tasks;

    try {
      await host.reply(mode === "live" ? "background-owner-live" : "background-owner");
      await expect
        .poll(async () => (await page()).find((task) => task.parent_task_id !== null)?.state, {
          timeout: 10_000
        })
        .toBe(mode === "live" ? "inactive" : "active");
      const [owner, child] = await page();
      expect(child?.parent_task_id).toBe(owner!.task_id);
      if (mode === "stopped") {
        await host.prompt(`update-id ${child!.task_id} follow_up`);
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
        await expect.poll(async () => (await page())[0]?.state).toBe("inactive");
      } else expect((await page())[0]?.state).toBe("active");
      const saved = await readFile(child!.session_file, "utf8");
      await host.prompt(`update-id ${child!.task_id} follow_up`);
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
      host = await Supervisor.start(directory, { sessionId: state.sessionId });
      expect((await page()).find((task) => task.task_id === child!.task_id)?.parent_task_id).toBe(
        owner!.task_id
      );
      const foreign = await Supervisor.start(directory);

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
    } finally {
      await host.stop();
      const leaked = await remainingProcesses(directory);
      await killFixtureProcesses(directory);
      await rm(directory, { recursive: true, force: true });
      expect(leaked).toEqual([]);
    }
  },
  40_000
);
