import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("executes native reads, a missing-file failure, and an image through the installed CLI", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory);

    const execution = promisify(execFile)(
      launch.command,
      [...launch.args, "--print", "exceptions"],
      {
        ...launch.options,
        timeout: 15000
      }
    );
    execution.child.stdin?.end();
    const { stdout, stderr } = await execution;
    expect(stderr).not.toContain("Failed to load extension");
    expect(stdout).toContain("Fixture finished: exceptions.");

    const messages = SessionManager.open(join(directory, "session.jsonl"))
      .getBranch()
      .flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
    const results = messages.filter((message) => message.role === "toolResult");
    expect(results.map((message) => message.toolName)).toEqual(["read", "read", "read", "read"]);
    expect(results.map((message) => message.isError)).toEqual([false, true, false, false]);
    expect(
      results.map((message) => message.content.some((block) => block.type === "image"))
    ).toEqual([false, false, true, false]);
    expect(results[2]!.content).toContainEqual(
      expect.objectContaining({ type: "image", mimeType: "image/png" })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
