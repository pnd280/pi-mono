import { setTimeout } from "node:timers/promises";

import type { AssistantMessageEvent, AssistantMessageEventStream } from "@earendil-works/pi-ai";
import { expect, it } from "vite-plus/test";

import { createFixtureMessage, createFixtureStream } from "./index.ts";

const model = { api: "fixture", provider: "fixture", id: "offline" };

async function collectEvents(
  stream: AssistantMessageEventStream
): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);

  return events;
}

it("creates independent zero-usage messages with explicit model identity and timestamps", () => {
  const first = createFixtureMessage(model, 42);
  first.usage.cost.input = 5;
  first.content.push({ type: "text", text: "first" });
  const second = createFixtureMessage(model, 43);
  expect(second).toMatchObject({
    api: "fixture",
    provider: "fixture",
    model: "offline",
    timestamp: 43,
    content: [],
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  });
  expect(first.timestamp).toBe(42);
});

it("emits text indices after existing tool content and completes through Pi's stream", async () => {
  const stream = createFixtureStream({
    model,
    async run({ message, text }) {
      message.content.push({ type: "toolCall", id: "call", name: "read", arguments: {} });
      text("first");
      text("second");

      return "toolUse";
    }
  });
  const events = await collectEvents(stream);
  expect(events.map(({ type }) => type)).toEqual([
    "start",
    "text_start",
    "text_delta",
    "text_end",
    "text_start",
    "text_delta",
    "text_end",
    "done"
  ]);
  expect(events[1]).toMatchObject({ contentIndex: 1 });
  expect(events[4]).toMatchObject({ contentIndex: 2 });
  expect(await stream.result()).toMatchObject({
    stopReason: "toolUse",
    content: [
      { type: "toolCall" },
      { type: "text", text: "first" },
      { type: "text", text: "second" }
    ]
  });
});

it("ends failed fixtures with an error rather than leaving stream consumers waiting", async () => {
  const stream = createFixtureStream({
    model,
    async run() {
      throw new Error("scenario failed");
    }
  });
  expect((await collectEvents(stream)).map(({ type }) => type)).toEqual(["start", "error"]);
  expect(await stream.result()).toMatchObject({
    stopReason: "error",
    errorMessage: "scenario failed"
  });
});

it("handles pre-abort, cancellation during a scenario, and cancellation before completion", async () => {
  for (const phase of ["before", "during", "completion"]) {
    const controller = new AbortController();
    if (phase === "before") controller.abort();
    let ran = false;
    const stream = createFixtureStream({
      model,
      signal: controller.signal,
      async run() {
        ran = true;

        if (phase === "completion") {
          controller.abort();

          return "stop";
        }

        await setTimeout(1000, undefined, { signal: controller.signal });

        return "stop";
      }
    });
    if (phase === "during") controller.abort();
    const events = await collectEvents(stream);
    expect(events.at(-1)).toMatchObject({ type: "error", reason: "aborted" });
    expect(events.some(({ type }) => type === "done")).toBe(false);
    expect((await stream.result()).stopReason).toBe("aborted");
    expect(ran).toBe(phase !== "before");
  }
});
