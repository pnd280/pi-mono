import { DEFAULT_MAX_BYTES, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./constants.ts";
import type { RunReader } from "./reader.ts";
import type { TaskRecord } from "./records.ts";
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
  session: { tasks: Tasks; reader: RunReader } | undefined,
  ui: Pick<ExtensionUIContext, "notify">
): Promise<void> {
  try {
    if (!session) throw new Error("Subagent session has not started");
    const { tasks, reader } = session;
    const [command = "list", ...tokens] = args.trim() ? args.trim().split(/\s+/) : [];
    let result: unknown;
    if (command === "list" || command === "show") await tasks.readDescendants();

    if (command === "list") {
      result = listPage(tasks.list(), tokens);
    } else if (command === "show" && tokens[0]) {
      result = await showTask(reader, tokens[0], tokens.slice(1));
    } else if (command === "abort" && tokens.length === 1 && tokens[0]) {
      const { record } = await tasks.abort(tokens[0]);
      result = { task_id: record.task_id, state: record.state, outcome: record.outcome };
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
