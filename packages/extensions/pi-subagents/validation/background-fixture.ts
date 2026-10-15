import { rm } from "node:fs/promises";

import { contentText } from "@earendil-works/pi-ai";
import type { FileEntry } from "@earendil-works/pi-coding-agent";
import { expect, type ExpectStatic } from "vite-plus/test";
import { z } from "zod";

import type { RpcRecord } from "../src/connection.ts";
import { LATE_USAGE_KIND, RESULT_MESSAGE } from "../src/constants.ts";
import { taskRecordSchema } from "../src/records.ts";
import { detailsSchema, type ToolDetails } from "../src/result.ts";
import { killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { Supervisor } from "./supervisor.ts";
import { createFixtureWorkspace } from "./workspace.ts";

export async function fixture(
  body: (host: Supervisor, directory: string) => Promise<void>,
  maxConcurrent = 4,
  maxDepth = 2,
  settings: Record<string, unknown> = {}
) {
  const directory = await createFixtureWorkspace({
    settings: { "ext.pi-subagents": { maxConcurrent, maxDepth }, ...settings }
  });
  let host: Supervisor | undefined;

  try {
    host = await Supervisor.start(directory);
    await body(host, directory);
  } finally {
    await host?.stop();
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked).toEqual([]);
  }
}

/** Starts supervisors on demand in one workspace; all stop, and no fixture process may remain. */
export async function withFixture(
  body: (
    directory: string,
    start: (options?: Parameters<typeof Supervisor.start>[1]) => Promise<Supervisor>
  ) => Promise<void>,
  options: Parameters<typeof createFixtureWorkspace>[0] = {}
): Promise<void> {
  const directory = await createFixtureWorkspace(options);
  const hosts: Supervisor[] = [];

  try {
    await body(directory, async (launchOptions) => {
      const host = await Supervisor.start(directory, launchOptions);
      hosts.push(host);

      return host;
    });
  } finally {
    await Promise.all(hosts.map((host) => host.stop()));
    const leaked = await remainingProcesses(directory);
    await killFixtureProcesses(directory);
    await rm(directory, { recursive: true, force: true });
    expect(leaked, "Processes leaked after the supervisor exited").toEqual([]);
  }
}

function tokens(usage: ToolDetails["usage"]): number {
  return usage.input + usage.output + usage.cache_read + usage.cache_write;
}

/** Each background child's usage reaches the totals once: returned with the call, the rest late. */
export function expectChildUsageOnce(entries: readonly FileEntry[], count: number): void {
  let returned = 0;
  let late = 0;
  let full = 0;
  const usage = entries.filter((entry) => entry.type === "usage");

  for (const entry of entries) {
    if (
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "subagent"
    )
      returned += entry.message.usage?.totalTokens ?? 0;
    if (entry.type === "usage" && entry.kind === LATE_USAGE_KIND) late += entry.usage.totalTokens;
    if (entry.type === "custom_message" && entry.customType === RESULT_MESSAGE)
      full += tokens(detailsSchema.parse(entry.details).usage);
  }

  expect(usage).toHaveLength(count);
  expect(late).toBeGreaterThan(0);
  expect(returned + late).toBe(full);
}

export function isResult(record: RpcRecord): boolean {
  return (
    record.type === "message_end" &&
    record.message.role === "custom" &&
    record.message.customType === RESULT_MESSAGE
  );
}

export function replies(text: string): (record: RpcRecord) => boolean {
  return (record) =>
    record.type === "message_end" &&
    record.message.role === "assistant" &&
    contentText(record.message.content).includes(text);
}

export async function taskList(host: Supervisor) {
  return z
    .object({ tasks: z.array(taskRecordSchema) })
    .parse(JSON.parse((await host.command("list")).message)).tasks;
}

/** Descendant records reach the supervisor in memory, through the child's updates. */
export async function descendantStarted(host: Supervisor, expect: ExpectStatic): Promise<void> {
  await expect
    .poll(async () => (await taskList(host)).some((task) => task.parent_task_id !== null), {
      timeout: 10_000,
      interval: 25
    })
    .toBe(true);
}
