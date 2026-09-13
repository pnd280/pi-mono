import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { METADATA_TYPE } from "../session-metadata.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("runs fixed plans through the installed CLI and resumes without replaying mutations", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory);

    const run = async (prompt: string) => {
      const execution = promisify(execFile)(launch.command, [...launch.args, "--print", prompt], {
        ...launch.options,
        timeout: 15000
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

    const entries = SessionManager.open(join(directory, "session.jsonl")).getBranch();
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
    expect(results.at(-1)?.content).toEqual([{ type: "text", text: changed }]);
    expect(
      entries.some((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
