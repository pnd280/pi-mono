import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { CALL_TYPE, parseWriterRecord, WRITER_TYPE } from "../src/transcript/metadata.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

it("runs fixed plans through the installed CLI and resumes without replaying mutations", async () => {
  const directory = await createFixtureWorkspace();

  try {
    const launch = await fixtureLaunch(directory, { paced: false });

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
    expect(results.at(-1)?.content).toEqual([{ type: "text", text: changed }]);
    const custom = (type: string) =>
      entries.flatMap((entry) =>
        entry.type === "custom" && entry.customType === type ? [entry.data] : []
      );
    // Replay derives the creation patch from content; Pi's edit patches replace the observed ones.
    expect(custom(CALL_TYPE)).toEqual([
      {
        entry: expect.any(String) as unknown,
        toolCallId: expect.any(String) as unknown,
        change: { kind: "creation" }
      }
    ]);
    expect(
      manager
        .buildSessionProjection()
        .messages.some(
          (message) =>
            message.role === "custom" &&
            (message.customType === CALL_TYPE || message.customType === WRITER_TYPE)
        )
    ).toBe(false);
    // Only the first process collects calls; the public fixture tool renders itself.
    const writers = custom(WRITER_TYPE).map(parseWriterRecord);
    expect(writers).toEqual([
      { writer: expect.any(String) as unknown, cwd: join(directory, "work") }
    ]);
    const local = await readFile(
      join(directory, "agent", "pi-tool-display", "calls", `${writers[0]!.writer}.jsonl`),
      "utf8"
    );
    const line = (tool: string) => ({
      type: "call",
      entry: expect.any(String) as unknown,
      toolCallId: expect.any(String) as unknown,
      tool,
      durationMs: expect.any(Number) as unknown
    });
    expect(
      local
        .trimEnd()
        .split("\n")
        .map((text) => JSON.parse(text) as unknown)
    ).toEqual([
      expect.objectContaining({ type: "writer", sessionFile: join(directory, "session.jsonl") }),
      line("write"),
      line("edit"),
      line("edit")
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
