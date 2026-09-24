import { join } from "node:path";

import {
  contentText,
  fauxProvider,
  normalizeContext,
  Type,
  type AssistantMessageEvent,
  type TranscriptContext
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createDisplayFixtureStream } from "./provider.ts";

// Route the fixture's promise-based visual pauses through Vitest's virtual clock.
vi.mock("node:timers/promises", () => ({
  setTimeout: (milliseconds: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    })
}));

const cwd = "/fixture/work";
const model = fauxProvider().getModel();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function context(prompt: string): TranscriptContext {
  return normalizeContext({
    messages: [{ role: "user", content: prompt, timestamp: 1 }],
    tools: ["read", "ls", "grep", "bash"].map((name) => ({
      name,
      description: "Available fixture tool",
      parameters: Type.Object({})
    }))
  });
}

async function turn(transcript: TranscriptContext) {
  // Recreate the stream factory each turn: continuation must come from history,
  // not a closure counter that would break fixture reload and replay.
  const stream = createDisplayFixtureStream(cwd)(model, transcript);
  const events: AssistantMessageEvent[] = [];
  const collect = (async () => {
    for await (const event of stream) events.push(structuredClone(event));
  })();
  await vi.runAllTimersAsync();
  await collect;
  const message = await stream.result();
  expect(message.errorMessage).toBeUndefined();
  const calls = message.content.filter((block) => block.type === "toolCall");
  transcript.messages.push(message);

  for (const call of calls) {
    transcript.messages.push({
      role: "toolResult",
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: "text", text: "fixture result" }],
      isError: false,
      timestamp: message.timestamp
    });
  }

  return { message, calls, events };
}

it("streams mixed native calls with repeated ranges before completing without replay", async () => {
  const transcript = context("native-mixed");
  const { message, calls, events } = await turn(transcript);
  expect(message.stopReason).toBe("toolUse");
  expect(calls.map(({ name, arguments: args }) => ({ name, args }))).toEqual([
    { name: "ls", args: { path: "a/" } },
    { name: "grep", args: { pattern: "alpha", path: "a/", limit: 2 } },
    { name: "read", args: { path: join(cwd, "a/alpha.txt"), limit: 5 } },
    { name: "read", args: { path: join(cwd, "a/alpha.txt"), offset: 15, limit: 2 } },
    { name: "read", args: { path: join(cwd, "a/alpha.txt"), limit: 5 } }
  ]);
  expect(new Set(calls.map(({ id }) => id)).size).toBe(calls.length);
  expect(events.map(({ type }) => type)).toEqual([
    "start",
    ...calls.flatMap(() => ["toolcall_start", "toolcall_delta", "toolcall_end"]),
    "done"
  ]);

  for (const event of events) {
    if (event.type === "toolcall_start") {
      expect(event.partial.content[event.contentIndex]).toMatchObject({ arguments: {} });
    } else if (event.type === "toolcall_delta") {
      expect(event.delta).toBe(JSON.stringify(calls[event.contentIndex]!.arguments));
    }
  }

  const finished = await turn(transcript);
  expect(finished.calls).toEqual([]);
  expect(finished.message.stopReason).toBe("stop");
  expect(contentText(finished.message.content)).toContain("Fixture finished: native-mixed.");
});

it("preserves relative and absolute path spellings for normalization checks", async () => {
  const { calls } = await turn(context("normalization"));
  expect(calls.map(({ name }) => name)).toEqual(["ls", "grep", "read", "read"]);
  expect(calls.map(({ arguments: args }) => args.path)).toEqual([
    "a/",
    "./a/nested/../",
    join(cwd, "a/alpha.txt"),
    "./a/nested/../beta.txt"
  ]);
  expect(calls[3]!.arguments).toMatchObject({ offset: 15, limit: 2 });
});

it("streams one thinking call per turn and retains the explanation boundary", async () => {
  const transcript = context("thinking");

  for (let index = 0; index < 4; index++) {
    const { message, calls, events } = await turn(transcript);
    expect(message.stopReason).toBe("toolUse");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "read",
      arguments: { path: join(cwd, index % 2 === 0 ? "a/alpha.txt" : "a/beta.txt") }
    });
    expect(message.content[0]).toEqual({
      type: "thinking",
      thinking: `Fixture thought before call ${index + 1}.`
    });
    expect(
      events.filter(({ type }) => type.startsWith("thinking_")).map(({ type }) => type)
    ).toEqual(["thinking_start", "thinking_delta", "thinking_end"]);
    expect(contentText(message.content).includes("Visible explanation:")).toBe(index === 2);
  }

  expect((await turn(transcript)).message.stopReason).toBe("stop");
  transcript.messages.push({ role: "user", content: "thinking", timestamp: 2 });
  expect((await turn(transcript)).calls[0]!.arguments.path).toBe(join(cwd, "a/alpha.txt"));
});

it("queues buffered shared partials and preserves repeated tool names across batches", async () => {
  const transcript = context("buffered");
  const shellCommands: unknown[] = [];

  for (const names of [["bash", "bash", "read"], ["read"], ["bash", "bash"], ["read"]]) {
    const { message, calls, events } = await turn(transcript);
    expect(message.stopReason).toBe("toolUse");
    expect(calls.map(({ name }) => name)).toEqual(names);
    expect(message.content[0]?.type).toBe("thinking");
    const thinkingEnd = events.find((event) => event.type === "thinking_end")!;
    // The queued thinking event already exposes later calls before their own events.
    expect(thinkingEnd.partial.content.filter((block) => block.type === "toolCall")).toEqual(calls);

    for (const call of calls) {
      if (call.name === "bash") shellCommands.push(call.arguments.command);
    }
  }

  expect(shellCommands).toHaveLength(4);

  for (const [index, label] of ["one", "two", "three", "four"].entries()) {
    expect(shellCommands[index]).toEqual(expect.stringContaining(`shell ${label}`));
  }

  const finished = await turn(transcript);
  expect(finished.calls).toEqual([]);
  expect(contentText(finished.message.content)).toContain("Fixture finished: buffered.");
});

it("skips unavailable FFF tools explicitly without executing a partial plan", async () => {
  const { message, calls } = await turn(context("fff"));
  expect(message.stopReason).toBe("stop");
  expect(calls).toEqual([]);
  expect(contentText(message.content)).toBe(
    "Skipped fixture fff: unavailable tools ffgrep, fffind."
  );
});
