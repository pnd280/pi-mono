import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("executes uninterrupted native scenarios and explicitly skips unavailable FFF tools", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory);

    for (const prompt of ["native-mixed", "normalization", "exceptions", "thinking", "fff"]) {
      const execution = promisify(execFile)(launch.command, [...launch.args, "--print", prompt], {
        ...launch.options,
        timeout: 15000
      });
      execution.child.stdin?.end();
      const { stdout, stderr } = await execution;
      expect(stderr).not.toContain("Failed to load extension");
      expect(stdout).toContain(
        prompt === "fff"
          ? "Skipped fixture fff: unavailable tools ffgrep, fffind."
          : `Fixture finished: ${prompt}.`
      );
    }

    const messages = SessionManager.open(join(directory, "session.jsonl"))
      .getBranch()
      .flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
    const results = messages.filter((message) => message.role === "toolResult");
    expect(results).toHaveLength(17);
    expect(results.filter((message) => message.isError)).toHaveLength(1);
    expect(
      results.filter((message) => message.content.some((block) => block.type === "image"))
    ).toHaveLength(1);
    expect(results.filter((message) => message.toolName === "grep")).toHaveLength(2);
    expect(results.filter((message) => message.toolName === "ls")).toHaveLength(2);
    const assistants = messages.filter((message) => message.role === "assistant");
    expect(
      assistants.filter((message) => message.content.some((block) => block.type === "thinking"))
    ).toHaveLength(4);
    expect(
      assistants.filter(
        (message) => message.content.filter((block) => block.type === "toolCall").length > 1
      )
    ).toHaveLength(3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
