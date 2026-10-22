import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it } from "vite-plus/test";

import { CALL_TYPE } from "../src/transcript/metadata.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("runs fixed plans through the installed CLI and resumes without replaying mutations", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory, { paced: false });

    const run = async (prompt: string) => {
      const execution = promisify(execFile)(launch.command, [...launch.args, "--print", prompt], {
        ...launch.options,
        timeout: STEP_TIMEOUT_MS
      });
      execution.child.stdin?.end();
      const { stdout, stderr } = await execution;
      expect(stderr).not.toContain("Failed to load extension");

      return stdout;
    };

    expect(await run("diff")).toContain("Fixture finished: diff.");
    const changed = await readFile(join(directory, "work", "a.ts"), "utf8");
    expect(changed).toBe('export const label = "after";\n');
    expect(await readFile(join(directory, "work", "created.ts"), "utf8")).toContain("界😀");
    expect(await run("public")).toContain("Fixture finished: public.");
    expect(await readFile(join(directory, "work", "a.ts"), "utf8")).toBe(changed);
    expect(await run("not a scenario; exit 19")).toContain("Choose a fixture prompt:");

    const manager = SessionManager.open(join(directory, "session.jsonl"));
    const entries = manager.getBranch();
    const results = entries.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []
    );
    expect(results.map((result) => result.toolName)).toEqual([
      "write",
      "edit",
      "edit",
      "display_fixture_read"
    ]);
    expect(results.every((result) => !result.isError)).toBe(true);
    // Replay shows Pi's measured durations from these results.
    expect(results.every((result) => typeof result.durationMs === "number")).toBe(true);
    expect(results.at(-1)?.content).toEqual([{ type: "text", text: changed }]);
    const custom = (type: string) =>
      entries.flatMap((entry) =>
        entry.type === "custom" && entry.customType === type ? [entry.data] : []
      );
    // Each observed operation is saved. Replay derives the creation patch from content, and
    // Pi's edit patches replace the observed ones. The write's diff has a wall-clock budget in
    // the Pi process, which suite load can exceed.
    const operation = {
      entry: expect.any(String) as unknown,
      toolCallId: expect.any(String) as unknown,
      operation: true
    };
    expect(custom(CALL_TYPE)).toEqual([
      {
        ...operation,
        change: expect.toBeOneOf([
          { kind: "creation" },
          { kind: "unavailable", reason: "budget-exceeded" }
        ]) as unknown
      },
      operation,
      operation
    ]);
    expect(
      manager
        .buildSessionProjection()
        .messages.some((message) => message.role === "custom" && message.customType === CALL_TYPE)
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
