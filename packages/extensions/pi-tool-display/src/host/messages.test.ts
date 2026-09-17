import { expect, it } from "vite-plus/test";

import { transcriptMessage } from "./messages.ts";

const message = {
  role: "assistant",
  timestamp: 42,
  content: [
    { type: "text", text: "thinking" },
    { type: "toolCall", id: "first", name: "read", arguments: { path: "first" } },
    { type: "toolCall", id: "second", name: "read", arguments: { path: "second" } }
  ]
};

it("selects only the content block named by a streaming update", () => {
  expect(transcriptMessage(message, 1)).toMatchObject({
    kind: "assistant",
    calls: [{ index: 1, id: "first" }]
  });
  expect(transcriptMessage(message, 0)).toMatchObject({ kind: "assistant", calls: [] });
  const guarded = [...message.content];
  Object.defineProperty(guarded, 2, {
    get: () => {
      throw new Error("unchanged block was read");
    }
  });
  expect(() => transcriptMessage({ ...message, content: guarded }, 1)).not.toThrow();
  expect(transcriptMessage(message)).toMatchObject({
    kind: "assistant",
    calls: [
      { index: 1, id: "first" },
      { index: 2, id: "second" }
    ]
  });
});
