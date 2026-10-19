import { DEFAULT_MAX_BYTES, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./constants.ts";
import type { RunReader } from "./history/reader.ts";
import { readLogTail } from "./jobs/log.ts";
import type { JobRecord } from "./jobs/records.ts";
import type { Jobs } from "./jobs/registry.ts";
import { showTask } from "./show.ts";
import type { Tasks } from "./tasks/registry.ts";

const USAGE =
  "Usage: /subagents list [--offset <n>] [--limit <n>] | jobs [--offset <n>] [--limit <n>] | show <task_id> [--since <cursor>] [--limit <n>] | show <task_id> --last | show <job_id> | abort <task_id|job_id> | background [task_id]";

const pageSchema = z.object({
  offset: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT)
});

type Page<T> = { items: T[]; total: number; offset: number; next_offset: number | null };

/** One page of `records` within the output budget, as `{ <key>, total, offset, next_offset }`. */
function listPage<T>(key: "tasks" | "jobs", records: readonly T[], tokens: string[]): unknown {
  const values: { offset: string | number; limit: string | number } = {
    offset: 0,
    limit: LIST_DEFAULT_LIMIT
  };
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 2) {
    const flag = tokens[i];
    const value = tokens[i + 1];

    if ((flag !== "--offset" && flag !== "--limit") || value === undefined || seen.has(flag)) {
      throw new Error(
        `Usage: /subagents ${key === "tasks" ? "list" : "jobs"} [--offset <n>] [--limit <n>]`
      );
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
  const page: Page<T> = { items: [], total: records.length, offset, next_offset: null };

  const output = () => {
    const { items, ...rest } = page;

    return { [key]: items, ...rest };
  };

  for (const record of records.slice(offset, offset + limit)) {
    page.items.push(record);
    const next = offset + page.items.length;
    page.next_offset = next < records.length ? next : null;
    if (Buffer.byteLength(JSON.stringify(output())) <= DEFAULT_MAX_BYTES) continue;
    page.items.pop();
    if (page.items.length === 0)
      throw new Error(`${key === "tasks" ? "Task" : "Job"} item exceeds the list output budget`);
    page.next_offset = offset + page.items.length;
    break;
  }

  return output();
}

function jobItem(job: JobRecord) {
  return {
    job_id: job.job_id,
    description: job.description,
    command: job.command,
    state: job.state,
    outcome: job.state === "inactive" ? job.outcome : null,
    exit_code: job.exit_code,
    started_at: job.started_at,
    ended_at: job.ended_at,
    log_file: job.log_file
  };
}

/** The job's state and the end of its log, shortened until the reply fits the output budget. */
async function showJob(job: JobRecord): Promise<unknown> {
  const result = (text: string | null) => ({
    job_id: job.job_id,
    state: job.state,
    outcome: job.state === "inactive" ? job.outcome : null,
    exit_code: job.exit_code,
    log_file: job.log_file,
    text
  });
  let maxBytes = DEFAULT_MAX_BYTES;
  let text: string | null;

  for (;;) {
    try {
      text = await readLogTail(job.log_file, { maxBytes });
    } catch {
      // A removed or unreadable log has no text.
      text = null;
    }

    // Escaped control characters can make the JSON text larger than the log text.
    if (Buffer.byteLength(JSON.stringify(result(text))) <= DEFAULT_MAX_BYTES || maxBytes < 1024)
      return result(text);
    maxBytes = Math.floor(maxBytes / 2);
  }
}

/** `jobs`, and `show` or `abort` with the ID of a job of this session; otherwise undefined. */
async function jobCommand(
  jobs: Jobs,
  command: string,
  tokens: string[]
): Promise<{ result: unknown } | undefined> {
  if (command === "jobs") return { result: listPage("jobs", jobs.list().map(jobItem), tokens) };
  const job =
    tokens.length === 1 ? jobs.list().find((item) => item.job_id === tokens[0]) : undefined;
  if (!job) return undefined;
  if (command === "show") return { result: await showJob(job) };
  if (command !== "abort") return undefined;
  // The user cancelled the job, so its result is still delivered.
  const record = await jobs.abort(job.job_id);

  return {
    result: {
      job_id: record.job_id,
      state: record.state,
      outcome: record.state === "inactive" ? record.outcome : null,
      exit_code: record.exit_code
    }
  };
}

async function taskCommand(
  tasks: Tasks,
  reader: RunReader,
  command: string,
  tokens: string[]
): Promise<unknown> {
  // A command reads the child files again, because another process can add descendants.
  if (command === "list" || command === "show") await tasks.tree.refresh();
  if (command === "list") return listPage("tasks", tasks.tree.list(), tokens);
  if (command === "show" && tokens[0]) return showTask(reader, tokens[0], tokens.slice(1));

  if (command === "abort" && tokens.length === 1 && tokens[0]) {
    const { record } = await tasks.abort(tokens[0]);

    return { task_id: record.task_id, state: record.state, outcome: record.outcome };
  }

  if (command === "background" && tokens.length <= 1)
    return { tasks: await tasks.background(tokens[0]) };
  throw new Error(USAGE);
}

export async function runCommand(
  args: string,
  session: { tasks: Tasks; jobs: Jobs; reader: RunReader } | undefined,
  ui: Pick<ExtensionUIContext, "notify">
): Promise<void> {
  try {
    if (!session) throw new Error("Subagent session has not started");
    const { tasks, jobs, reader } = session;
    const [command = "list", ...tokens] = args.trim() ? args.trim().split(/\s+/) : [];
    const job = await jobCommand(jobs, command, tokens);
    const result = job ? job.result : await taskCommand(tasks, reader, command, tokens);
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
