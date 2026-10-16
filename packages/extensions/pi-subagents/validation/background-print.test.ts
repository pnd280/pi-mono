import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

import { contentText } from "@earendil-works/pi-ai";
import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test as caseTest } from "vite-plus/test";

import { RESULT_MESSAGE } from "../src/constants.ts";
import { expectChildUsageOnce } from "./background-fixture.ts";
import { killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

// Each test owns its workspace and processes.
const test = caseTest.skipIf(process.platform !== "linux").concurrent;

test.each([
  ["print", "background-idle", 1],
  ["json", "background-idle", 1],
  ["print", "background-pair", 2],
  ["json", "background-pair", 2],
  ["print", "background-error", 1],
  ["json", "background-error", 1],
  // The result is ready when the final reply fails, so the failed turn must not take it.
  ["print", "background-busy-error", 1],
  ["json", "background-busy-error", 1]
] as const)(
  "consumes each background completion before %s exits after %s",
  async (mode, scenario, count) => {
    const directory = await createFixtureWorkspace();

    try {
      const launch = await fixtureLaunch(directory);
      const child = promisify(execFile)(
        launch.command,
        [
          ...launch.args,
          "--print",
          ...(mode === "json" ? ["--mode", "json"] : []),
          "--session",
          `${directory}/supervisor.jsonl`,
          scenario
        ],
        { ...launch.options, timeout: STEP_TIMEOUT_MS }
      );
      child.child.stdin?.end();
      const { stdout } = await child;
      expect(stdout).toContain(`background results ${count}`);
      const entries = parseSessionEntries(await readFile(`${directory}/supervisor.jsonl`, "utf8"));
      const results = entries.flatMap((entry, index) =>
        entry.type === "custom_message" && entry.customType === RESULT_MESSAGE ? [index] : []
      );
      expect(results).toHaveLength(count);

      // Each result continues the run before the next result arrives.
      for (const [index, result] of results.entries()) {
        const reply = entries.findIndex(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "assistant" &&
            contentText(entry.message.content).includes(`background results ${index + 1}`)
        );
        expect(reply).toBeGreaterThan(result);
        expect(reply).toBeLessThan(results[index + 1] ?? entries.length);
      }

      expectChildUsageOnce(entries, count);
      expect(await remainingProcesses(directory)).toEqual([]);
    } finally {
      await killFixtureProcesses(directory);
      await rm(directory, { recursive: true, force: true });
    }
  }
);
