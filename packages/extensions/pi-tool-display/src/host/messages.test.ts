import { expect, it } from "vite-plus/test";

import { TranscriptMessages } from "./messages.ts";

it.each([
  { role: "system", content: "Updated instructions", timestamp: 1 },
  { type: "usage", kind: "cache_warm" }
])("leaves visibility of transcript metadata to Pi: %j", (entry) => {
  expect(new TranscriptMessages().read(entry)).toBeUndefined();
});

const message = {
  role: "assistant",
  timestamp: 42,
  content: [
    { type: "thinking", thinking: "thought" },
    { type: "toolCall", id: "first", name: "read", arguments: { path: "first" } },
    { type: "toolCall", id: "second", name: "read", arguments: { path: "second" } }
  ]
};

it("discovers buffered calls in source order on an update at index 1", () => {
  const messages = new TranscriptMessages();
  messages.read({ ...message, content: [] });
  expect(messages.read(message, 1)).toMatchObject({
    kind: "assistant",
    calls: [
      { index: 1, id: "first" },
      { index: 2, id: "second" }
    ]
  });
  expect(messages.read(message, 0)).toMatchObject({ kind: "assistant", calls: [] });
  expect(messages.read(message, 1)).toMatchObject({
    kind: "assistant",
    calls: [{ index: 1, id: "first" }]
  });
});

it("discovers new calls without rescanning a long buffered message on each update", () => {
  let visits = 0;
  const content = new Proxy(
    Array.from({ length: 1000 }, (_, index) => ({
      type: "toolCall",
      id: String(index),
      name: "read",
      arguments: { path: `${index}.ts` }
    })),
    {
      get(target, key, receiver): unknown {
        if (typeof key === "string" && /^\d+$/.test(key)) visits++;

        return Reflect.get(target, key, receiver);
      }
    }
  );
  const messages = new TranscriptMessages();
  const partial = { ...message, content };
  messages.read(partial, 0);
  expect(visits).toBeLessThan(2000);
  visits = 0;
  for (let update = 0; update < 100; update++) messages.read(partial, 1);
  expect(visits).toBeLessThan(300);

  content.push({ type: "toolCall", id: "new", name: "read", arguments: { path: "new.ts" } });
  visits = 0;
  expect(messages.read(partial, 1000)).toMatchObject({
    calls: [{ index: 1000, id: "new" }]
  });
  expect(visits).toBeLessThan(5);

  content.push({ type: "toolCall", id: "later", name: "read", arguments: { path: "later.ts" } });
  visits = 0;
  expect(messages.read(partial, 1)).toMatchObject({
    calls: [
      { index: 1, id: "1" },
      { index: 1001, id: "later" }
    ]
  });
  expect(visits).toBeLessThan(6);
});

it("fully reconciles starts, final content replacements, and new or shortened messages", () => {
  const messages = new TranscriptMessages();
  messages.read(message, 0);
  const calls = [
    { index: 1, id: "first" },
    { index: 2, id: "second" }
  ];
  expect(messages.read(message)).toMatchObject({ calls });
  expect(messages.read({ ...message, timestamp: 43 }, 0)).toMatchObject({ calls });
  expect(
    messages.read({ ...message, timestamp: 43, content: message.content.slice(1) }, 0)
  ).toMatchObject({
    calls: [
      { index: 0, id: "first" },
      { index: 1, id: "second" }
    ]
  });
  // Final-message middleware may reorder or replace blocks, not just append them.
  expect(messages.read({ ...message, content: [...message.content].reverse() })).toMatchObject({
    calls: [
      { index: 0, id: "second" },
      { index: 1, id: "first" }
    ]
  });
});
