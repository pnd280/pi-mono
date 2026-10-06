import { readFile, rm } from "node:fs/promises";

import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { RESULT_MESSAGE } from "../src/constants.ts";
import { taskRecordSchema } from "../src/records.ts";
import { detailsSchema } from "../src/result.ts";
import { remainingProcesses, killFixtureProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

const pageSchema = z.object({
  task_id: z.string(),
  cursor: z.string().nullable(),
  items: z.array(z.object({ type: z.enum(["user", "assistant", "tools"]), text: z.string() })),
  more: z.boolean().optional(),
  omitted: z.number().optional(),
  usage: z.object({ input: z.number(), output: z.number(), cost: z.number() })
});

test.skipIf(process.platform !== "linux").each([true, false])(
  "pages late final summaries on the selected ancestry without modifying the child (display=%s)",
  async (display) => {
    const directory = await createFixtureWorkspace({ display });
    const host = await Supervisor.start(directory);

    try {
      await host.reply("background-digest");
      const id = detailsSchema.parse((await host.results())[0]!.details).task_id!;

      const show = async (options = "") => {
        const notification = await host.command(`show ${id} ${options}`);
        expect(notification.notifyType).toBe("info");

        return pageSchema.parse(JSON.parse(notification.message));
      };

      const early = await show();
      expect(early.items.some((item) => item.type === "tools")).toBe(false);
      await host.wait(
        (event) =>
          event.type === "message_end" &&
          event.message.role === "custom" &&
          event.message.customType === RESULT_MESSAGE
      );
      const completed = await show();
      expect(completed.items).toHaveLength(display ? 3 : 2);
      expect(completed.items.filter((item) => item.type === "tools")).toEqual(
        display ? [{ type: "tools", text: "Read 1 file" }] : []
      );
      expect(completed.usage).toMatchObject({ input: 20, output: 10, cost: 0.002 });

      if (early.cursor) {
        const later = await show(`--since ${early.cursor}`);
        expect(later.items.filter((item) => item.type === "tools")).toHaveLength(display ? 1 : 0);
        expect(later.more).toBe(false);
      }

      await host.prompt(`digest-fork ${id}`);
      expect(JSON.parse((await host.command(`show ${id} --last`)).message)).toEqual({
        task_id: id,
        state: "inactive",
        cursor: null,
        text: null
      });
      await host.prompt(`resume-id ${id}`);
      const task = z
        .object({ tasks: z.array(taskRecordSchema) })
        .parse(JSON.parse((await host.command("list")).message)).tasks[0]!;
      const before = await readFile(task.session_file, "utf8");
      const entries = parseSessionEntries(before).filter((entry) => entry.type !== "session");
      const first = entries[0]!;
      let cursor = first.id;
      const seen = [];

      for (let index = 0; index < 10; index++) {
        const page = await show(`--since ${cursor} --limit 1`);
        expect(page.items.length).toBeLessThanOrEqual(1);
        seen.push(...page.items);
        expect(page.cursor).not.toBe(cursor);
        cursor = page.cursor!;
        if (!page.more) break;
      }

      expect(seen).toHaveLength(2);
      expect(seen.filter((item) => item.type === "tools")).toEqual([]);
      expect(seen.filter((item) => item.type === "assistant").map((item) => item.text)).toEqual([
        "No earlier fixture seed"
      ]);
      const latest = await show("--limit 1");
      expect(latest.omitted).toBe(1);
      expect(latest.usage).toMatchObject({ input: 10, output: 5, cost: 0.001 });
      const last: unknown = JSON.parse((await host.command(`show ${id} --last`)).message);
      expect(last).toEqual({
        task_id: id,
        state: "inactive",
        cursor: entries
          .filter((entry) => entry.type === "message" && entry.message.role === "assistant")
          .at(-1)!.id,
        text: "No earlier fixture seed"
      });
      expect((await show(`--since ${cursor}`)).items).toEqual([]);
      expect((await host.command(`show ${id} --since missing-cursor`)).notifyType).toBe("error");
      expect(JSON.stringify(seen)).not.toMatch(
        /DO_NOT_SHOW_THINKING|\.pi-subagents-fixture|disposable subagents workspace/
      );
      expect(await readFile(task.session_file, "utf8")).toBe(before);
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
