import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";

import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import { test as caseTest } from "vite-plus/test";
import { z } from "zod";

import { END_ENTRY, RESULT_MESSAGE } from "../src/constants.ts";
import { detailsSchema } from "../src/result.ts";
import { taskRecordSchema } from "../src/tasks/records.ts";
import { fixtureProcesses, killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

const pageSchema = z.object({
  task_id: z.string(),
  cursor: z.string().nullable(),
  items: z.array(z.object({ type: z.enum(["user", "assistant", "tools"]), text: z.string() })),
  more: z.boolean().optional(),
  omitted: z.number().optional(),
  usage: z.object({ input: z.number(), output: z.number(), cost: z.number() })
});

test("pages tool summaries on the selected ancestry once without modifying the child", async ({
  expect
}) => {
  const directory = await createFixtureWorkspace();
  const host = await Supervisor.start(directory);

  try {
    await host.reply("background-digest");
    const id = detailsSchema.parse((await host.results())[0]!.details).task_id!;

    const show = async (options = "") => {
      const notification = await host.command(`show ${id} ${options}`);
      expect(notification.notifyType).toBe("info");

      return pageSchema.parse(JSON.parse(notification.message));
    };

    await expect.poll(() => existsSync(`${directory}/work/digest-ready`)).toBe(true);
    const early = await show();
    expect(early.items).toEqual([{ type: "user", text: "activity-digest" }]);
    const file = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message)).tasks[0]!.session_file;
    expect(
      parseSessionEntries(await readFile(file, "utf8")).find(
        (entry) => entry.type !== "session" && entry.id === early.cursor
      )
    ).toMatchObject({
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "DO_NOT_SHOW_THINKING" },
          {
            type: "toolCall",
            id: "shared-activity-call",
            name: "read",
            arguments: { path: ".pi-subagents-fixture" }
          }
        ]
      }
    });
    await writeFile(`${directory}/work/digest-release`, "release");
    await host.wait(
      (event) =>
        event.type === "message_end" &&
        event.message.role === "custom" &&
        event.message.customType === RESULT_MESSAGE
    );
    const completed = await show();
    expect(completed.items).toEqual([
      { type: "user", text: "activity-digest" },
      { type: "tools", text: "read ×1" },
      { type: "assistant", text: "Activity fixture finished" }
    ]);
    expect(completed.usage).toMatchObject({ input: 20, output: 10, cost: 0.002 });

    // The tool result completes after the cursor's assistant entry.
    const later = await show(`--since ${early.cursor}`);
    expect([...early.items, ...later.items]).toEqual(completed.items);
    expect(later.more).toBe(false);
    let pageCursor = parseSessionEntries(await readFile(file, "utf8")).find(
      (entry) => entry.type !== "session"
    )!.id;
    const pages = [];

    for (let index = 0; index < 10; index++) {
      const page = await show(`--since ${pageCursor} --limit 1`);
      expect(page.items).toHaveLength(1);
      pages.push(...page.items);
      pageCursor = page.cursor!;
      if (!page.more) break;
    }

    expect(pages).toEqual(completed.items.slice(completed.items.length - pages.length));
    expect(pages).toContainEqual({ type: "tools", text: "read ×1" });

    await host.prompt(`digest-compact ${id}`);
    const compacted = await show();
    expect(compacted.items.slice(0, completed.items.length)).toEqual(completed.items);
    // Two runs of the fixture's replies, and the fixture's compaction entry of 7 and 3 tokens.
    const listed = z
      .object({ tasks: z.array(taskRecordSchema) })
      .parse(JSON.parse((await host.command("list")).message)).tasks[0]!.usage;

    for (const usage of [compacted.usage, listed]) {
      expect(usage).toMatchObject({ input: 37, output: 18 });
      expect(usage?.cost).toBeCloseTo(0.004, 9);
    }

    expect(
      (await show(`--since ${completed.cursor}`)).items.filter((item) => item.type === "tools")
    ).toEqual([]);

    // Resuming the first run branches the child file away from the compacted run.
    const firstEnd = (await host.entries()).find(
      (entry) => entry.type === "custom" && entry.customType === END_ENTRY
    )!;
    await host.request({ type: "prompt", message: `/fixture-tree ${firstEnd.id}` });
    expect(JSON.parse((await host.command(`show ${id} --last`)).message)).toMatchObject({
      task_id: id,
      state: "inactive",
      text: "Activity fixture finished"
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

    expect(seen).toEqual([
      ...completed.items,
      { type: "user", text: "recall" },
      { type: "assistant", text: "No earlier fixture seed" }
    ]);
    const latest = await show("--limit 1");
    expect(latest.omitted).toBe(4);
    expect(latest.usage).toMatchObject({ input: 30, output: 15, cost: 0.003 });
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
});

test("returns the latest assistant text after an abort during a tool call", async ({ expect }) => {
  const directory = await createFixtureWorkspace();
  const host = await Supervisor.start(directory);

  try {
    await host.reply("background-abort-tool");
    const id = detailsSchema.parse((await host.results())[0]!.details).task_id!;
    await expect
      .poll(async () => (await fixtureProcesses(directory)).map(({ command }) => command))
      .toContainEqual(expect.stringContaining("sleep 600"));
    await host.command(`abort ${id}`);
    const listed = async () =>
      z
        .object({ tasks: z.array(taskRecordSchema) })
        .parse(JSON.parse((await host.command("list")).message)).tasks[0]!;
    await expect.poll(async () => (await listed()).state).toBe("inactive");
    const entries = parseSessionEntries(await readFile((await listed()).session_file, "utf8"));
    const assistants = entries.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "assistant"
        ? [{ id: entry.id, message: entry.message }]
        : []
    );
    // Pi 1.0.2, 1.2.0, and 1.3.0 request one more response after the aborted tool and record it
    // as an empty error. Without that message, this test does not cover the skip.
    expect(assistants.map(({ message }) => [message.stopReason, message.content.length])).toEqual([
      ["toolUse", 2],
      ["error", 0]
    ]);
    expect(JSON.parse((await host.command(`show ${id} --last`)).message)).toEqual({
      task_id: id,
      state: "inactive",
      cursor: assistants[0]!.id,
      text: "Fixture text before the tool"
    });
  } finally {
    await host.stop();
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked).toEqual([]);
  }
});
