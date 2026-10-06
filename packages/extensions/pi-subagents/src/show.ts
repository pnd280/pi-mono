import { contentText, type Usage } from "@earendil-works/pi-ai";
import {
  buildSessionProjection,
  DEFAULT_MAX_BYTES,
  truncateHead,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import {
  createTranscriptModel,
  parseTranscriptRecord,
  summarizeRun,
  TRANSCRIPT_TYPE,
  type TranscriptSnapshot
} from "pi-tool-display/viewer";
import { z } from "zod";

import { checkpointSession, readCheckpoint } from "./checkpoints.ts";
import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./constants.ts";
import { boundedText, detailsUsage, sumUsage, type ToolDetails } from "./result.ts";
import type { Tasks } from "./tasks.ts";

type Item = { type: "user" | "assistant" | "tools"; text: string };

type Options = { since?: string; limit: number; last: boolean };

const USAGE = "Usage: /subagents show <task_id> [--since <cursor>] [--limit <n>] | --last";

function options(tokens: string[]): Options {
  if (tokens.length === 1 && tokens[0] === "--last") return { last: true, limit: 1 };
  const result: Options = { last: false, limit: LIST_DEFAULT_LIMIT };
  const seen = new Set<string>();

  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag || !value || seen.has(flag)) throw new Error(USAGE);
    seen.add(flag);
    if (flag === "--since") result.since = value;
    else if (flag === "--limit") {
      const limit = z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).safeParse(value);
      if (!limit.success) throw new Error(`limit must be 1 to ${LIST_MAX_LIMIT}`);
      result.limit = limit.data;
    } else throw new Error(USAGE);
  }

  return result;
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

/** Validate final summaries only on the selected ancestry. */
function items(snapshot: TranscriptSnapshot): { id: string; item: Item }[] {
  const result: { id: string; item: Item }[] = [];
  const finals = new Set<string>();

  for (const [index, entry] of snapshot.entries.entries()) {
    if (
      entry.type === "message" &&
      (entry.message.role === "user" || entry.message.role === "assistant")
    ) {
      const value = contentText(entry.message.content);
      if (value)
        result.push({ id: entry.id, item: { type: entry.message.role, text: text(value) } });
      continue;
    }

    if (entry.type !== "custom" || entry.customType !== TRANSCRIPT_TYPE) continue;
    const record = parseTranscriptRecord(entry.data);
    if (record?.kind !== "run" || !record.final) continue;
    const key = JSON.stringify([record.sessionId, record.generation, record.id]);
    if (finals.has(key)) continue;
    const model = createTranscriptModel({
      ...snapshot,
      entries: snapshot.entries.slice(0, index + 1),
      leafId: entry.id
    });

    try {
      const summary = summarizeRun(model, record);
      if (!summary) continue;
      finals.add(key);
      result.push({ id: entry.id, item: { type: "tools", text: summary.text } });
    } finally {
      model.dispose();
    }
  }

  return result;
}

async function snapshot(tasks: Tasks, id: string): Promise<TranscriptSnapshot> {
  const task = tasks.owned(id);
  const live = tasks.active(id);

  if (live) {
    try {
      const response = await live.run.connection.request({ type: "get_entries" });
      if (!response.success) throw new Error(response.error);
      if (response.command !== "get_entries") throw new Error("Missing child entries");

      return { sessionId: task.session_id, cwd: live.source.cwd, ...response.data };
    } catch (error) {
      if (tasks.active(id)) throw error;
    }
  }

  return readCheckpoint(task);
}

function lastText(saved: TranscriptSnapshot): { cursor: string | null; text: string | null } {
  const projected = buildSessionProjection([...saved.entries], saved.leafId);

  for (const entry of projected.entries.slice().reverse()) {
    const last = entry.messages
      .slice()
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          !(message.stopReason === "aborted" && message.content.length === 0)
      );
    if (last?.role === "assistant")
      return {
        cursor: entry.sourceEntry.id,
        text: boundedText(contentText(last.content, ""))
      };
  }

  return { cursor: null, text: null };
}

export async function showTask(tasks: Tasks, id: string, tokens: string[]): Promise<unknown> {
  const config = options(tokens);
  const captured = await snapshot(tasks, id);
  const saved = { ...captured, entries: checkpointSession(captured).getBranch() };
  const task = tasks.owned(id);
  if (config.last) return { task_id: id, state: task.state, ...lastText(saved) };
  const common = { task_id: id, state: task.state, usage: usage(saved.entries) };

  const start =
    config.since === undefined ? -1 : saved.entries.findIndex((entry) => entry.id === config.since);
  if (config.since !== undefined && start < 0)
    throw new Error("Unknown subagent transcript cursor");
  const all = items(saved);
  const positions = new Map(saved.entries.map((entry, index) => [entry.id, index]));
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
          : (saved.entries.at(-1)?.id ?? null),
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
