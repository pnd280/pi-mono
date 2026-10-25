import { contentText, type Usage } from "@earendil-works/pi-ai";
import {
  buildSessionProjection,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./constants.ts";
import { parseFlags } from "./flags.ts";
import type { RunReader } from "./history/reader.ts";
import { boundedText, detailsUsage, sumUsage, type ToolDetails } from "./result.ts";
import type { TaskRecord } from "./tasks/records.ts";

type Item = { type: "user" | "assistant" | "tools"; text: string };

type Options = { since?: string; limit: number; last: boolean };

const USAGE = "Usage: /subagents show <task_id> [--since <cursor>] [--limit <n>] | --last";

function options(tokens: string[]): Options {
  if (tokens.length === 1 && tokens[0] === "--last") return { last: true, limit: 1 };
  const flags = parseFlags(
    tokens,
    {
      "--since": (value) => value,
      "--limit": (value) => {
        const limit = z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).safeParse(value);
        if (!limit.success) throw new Error(`limit must be 1 to ${LIST_MAX_LIMIT}`);

        return limit.data;
      }
    },
    USAGE
  );

  return {
    last: false,
    limit: flags["--limit"] ?? LIST_DEFAULT_LIMIT,
    ...(flags["--since"] === undefined ? {} : { since: flags["--since"] })
  };
}

function text(value: string): string {
  return truncateHead(value, { maxBytes: 2000, maxLines: 2000 }).content;
}

function usage(entries: readonly SessionEntry[]): ToolDetails["usage"] {
  let total = detailsUsage();

  const add = (value: Usage | undefined) => {
    if (value) total = sumUsage(total, detailsUsage(value));
  };

  for (const entry of entries) {
    if (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary")
      add(entry.usage);
    else if (
      entry.type === "message" &&
      (entry.message.role === "assistant" || entry.message.role === "toolResult")
    )
      add(entry.message.usage);
  }

  return total;
}

/** Names each tool once, in call order, with its count. */
function summary(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

  return text([...counts].map(([name, count]) => `${name} ×${count}`).join(", "));
}

/**
 * A response's calls are summarised at the entry that completes them, so later entries never
 * add an item before a cursor. Calls that never complete have no summary.
 */
function items(entries: readonly SessionEntry[]): { id: string; item: Item }[] {
  const result: { id: string; item: Item }[] = [];
  const open = new Map<string, { names: string[]; pending: Set<string> }>();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const { message } = entry;

    if (message.role === "toolResult") {
      const group = open.get(message.toolCallId);
      if (!group) continue;
      open.delete(message.toolCallId);
      group.pending.delete(message.toolCallId);
      if (!group.pending.size)
        result.push({ id: entry.id, item: { type: "tools", text: summary(group.names) } });
      continue;
    }

    if (message.role !== "user" && message.role !== "assistant") continue;
    const value = contentText(message.content);
    if (value) result.push({ id: entry.id, item: { type: message.role, text: text(value) } });
    if (message.role !== "assistant") continue;
    const calls = message.content.filter((block) => block.type === "toolCall");
    const group = { names: calls.map((call) => call.name), pending: new Set<string>() };

    for (const call of calls) {
      group.pending.add(call.id);
      open.set(call.id, group);
    }
  }

  return result;
}

function lastText(entries: readonly SessionEntry[]): {
  cursor: string | null;
  text: string | null;
} {
  const projected = buildSessionProjection([...entries], entries.at(-1)?.id ?? null);

  for (const entry of projected.entries.slice().reverse()) {
    // A stopped or failed request can end with an empty message, also after an abort.
    const last = entry.messages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant" && message.content.length > 0);
    if (last?.role === "assistant")
      return { cursor: entry.sourceEntry.id, text: contentText(last.content, "") };
  }

  return { cursor: null, text: null };
}

/** The `--last` response, with the text shortened until the complete response fits the output budget. */
function lastResponse(id: string, state: TaskRecord["state"], entries: readonly SessionEntry[]) {
  const { cursor, text } = lastText(entries);

  for (let maxBytes = DEFAULT_MAX_BYTES; ; maxBytes = Math.floor(maxBytes / 2)) {
    const response = {
      task_id: id,
      state,
      cursor,
      text: text === null ? null : boundedText(text, DEFAULT_MAX_LINES, maxBytes)
    };

    // Escaped control characters can make the JSON text larger than the text.
    if (Buffer.byteLength(JSON.stringify(response)) <= DEFAULT_MAX_BYTES || maxBytes === 0)
      return response;
  }
}

/** The state is the read run's state, even when the task starts another run during the read. */
export async function showTask(reader: RunReader, id: string, tokens: string[]): Promise<unknown> {
  const config = options(tokens);
  const {
    record: task,
    history: { entries }
  } = await reader.read(id);
  if (config.last) return lastResponse(id, task.state, entries);
  const common = { task_id: id, state: task.state, usage: usage(entries) };

  const start =
    config.since === undefined ? -1 : entries.findIndex((entry) => entry.id === config.since);
  if (config.since !== undefined && start < 0)
    throw new Error("Unknown subagent transcript cursor");
  const all = items(entries);
  const positions = new Map(entries.map((entry, index) => [entry.id, index]));
  const eligible = all.filter((item) => (positions.get(item.id) ?? -1) > start);

  const selected =
    config.since === undefined ? eligible.slice(-config.limit) : eligible.slice(0, config.limit);

  const page = () => {
    const more = selected.length < eligible.length;

    return {
      ...common,
      cursor:
        config.since !== undefined && more
          ? (selected.at(-1)?.id ?? config.since)
          : (entries.at(-1)?.id ?? null),
      ...(config.since === undefined ? { omitted: all.length - selected.length } : { more }),
      items: selected.map(({ item }) => item)
    };
  };

  while (Buffer.byteLength(JSON.stringify(page())) > DEFAULT_MAX_BYTES && selected.length) {
    if (config.since === undefined) selected.shift();
    else selected.pop();
  }

  if (eligible.length && !selected.length)
    throw new Error("Transcript item exceeds the output budget");

  return page();
}
