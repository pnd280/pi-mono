import { DEFAULT_MAX_BYTES, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./constants.ts";
import { controlRequestSchema } from "./control.ts";
import type { TaskRecord } from "./records.ts";
import { parseRelay } from "./relay.ts";
import { showTask } from "./show.ts";
import type { Tasks } from "./tasks.ts";

const pageSchema = z.object({
  offset: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT)
});

type TaskPage = { tasks: TaskRecord[]; total: number; offset: number; next_offset: number | null };

function listPage(records: TaskRecord[], tokens: string[]): TaskPage {
  const values: { offset: string | number; limit: string | number } = {
    offset: 0,
    limit: LIST_DEFAULT_LIMIT
  };
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 2) {
    const flag = tokens[i];
    const value = tokens[i + 1];

    if ((flag !== "--offset" && flag !== "--limit") || value === undefined || seen.has(flag)) {
      throw new Error("Usage: /subagents list [--offset <n>] [--limit <n>]");
    }

    seen.add(flag);
    values[flag === "--offset" ? "offset" : "limit"] = value;
  }

  const parsed = pageSchema.safeParse(values);
  if (!parsed.success)
    throw new Error(
      `offset must be a non-negative safe integer; limit must be 1 to ${LIST_MAX_LIMIT}`
    );
  const { offset, limit } = parsed.data;
  const page: TaskPage = { tasks: [], total: records.length, offset, next_offset: null };

  for (const record of records.slice(offset, offset + limit)) {
    page.tasks.push(record);
    const next = offset + page.tasks.length;
    page.next_offset = next < records.length ? next : null;
    if (Buffer.byteLength(JSON.stringify(page)) <= DEFAULT_MAX_BYTES) continue;
    page.tasks.pop();
    if (page.tasks.length === 0) throw new Error("Task item exceeds the list output budget");
    page.next_offset = offset + page.tasks.length;
    break;
  }

  return page;
}

export async function runCommand(
  args: string,
  tasks: Tasks | undefined,
  ui: Pick<ExtensionUIContext, "notify">,
  depth: number
): Promise<void> {
  try {
    if (!tasks) throw new Error("Subagent session has not started");

    if (args.trim().startsWith("relay ")) {
      if (depth < 1) throw new Error("Relay is only available in child supervisors");
      const value: unknown = JSON.parse(args.trim().slice(6));
      const control = controlRequestSchema.safeParse(value).data;

      if (control) {
        await tasks.control(control);

        return;
      }

      const message = parseRelay(value);
      if (!message) throw new Error("Invalid subagent relay message");
      await tasks.relay.reply(message);

      return;
    }

    const [command = "list", ...tokens] = args.trim() ? args.trim().split(/\s+/) : [];
    let result: unknown;

    if (command === "list") {
      result = listPage(tasks.list(), tokens);
    } else if (command === "show" && tokens[0]) {
      result = await showTask(tasks, tokens[0], tokens.slice(1));
    } else if (command === "abort" && tokens.length === 1 && tokens[0]) {
      const task = await tasks.abort(tokens[0]);
      result = { task_id: task.task_id, state: task.state, outcome: task.outcome };
    } else if (command === "background" && tokens.length <= 1) {
      result = { tasks: await tasks.background(tokens[0]) };
    } else {
      throw new Error(
        "Usage: /subagents list [--offset <n>] [--limit <n>] | show <task_id> [--since <cursor>] [--limit <n>] | show <task_id> --last | abort <task_id> | background [task_id]"
      );
    }

    const json = JSON.stringify(result);
    if (Buffer.byteLength(json) > DEFAULT_MAX_BYTES)
      throw new Error("Command result exceeds the output budget");
    ui.notify(json, "info");
  } catch (error) {
    const json = JSON.stringify({
      error: error instanceof Error ? error.message : "Subagent command failed"
    });
    ui.notify(
      Buffer.byteLength(json) <= DEFAULT_MAX_BYTES
        ? json
        : '{"error":"Subagent command failed; diagnostic too large"}',
      "error"
    );
  }
}
