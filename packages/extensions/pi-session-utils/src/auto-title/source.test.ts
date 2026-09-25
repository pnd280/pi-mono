import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createFixtureMessage } from "@pi-mono/libs/validation/provider";
import { expect, it } from "vite-plus/test";

import { conversationSource, firstRequestSource, requestSource } from "./source.ts";

it("selects the first nonempty user text, excluding images and non-message entries", () => {
  const session = SessionManager.inMemory();
  session.appendSessionInfo("Metadata");
  session.appendMessage({ role: "user", content: " \n ", timestamp: 0 });
  session.appendMessage({
    role: "user",
    content: [{ type: "image", data: "private-image", mimeType: "image/png" }],
    timestamp: 1
  });
  expect(firstRequestSource(session.getBranch())).toBe("");
  session.appendMessage({
    role: "user",
    content: [{ type: "text", text: " Opening request " }],
    timestamp: 2
  });
  session.appendMessage({ role: "user", content: "Later request", timestamp: 3 });
  expect(firstRequestSource(session.getBranch())).toBe("Opening request");
});

it("retains ordered conversation text only from the active branch", () => {
  const session = SessionManager.inMemory();
  const root = session.appendMessage({ role: "user", content: "Opening request", timestamp: 0 });
  session.appendMessage({ role: "user", content: "Abandoned branch", timestamp: 1 });
  session.branch(root);
  const response = createFixtureMessage({ api: "fixture", provider: "fixture", id: "model" });
  response.content = [
    { type: "thinking", thinking: "private thinking" },
    { type: "text", text: "Assistant context" },
    { type: "toolCall", id: "call", name: "read", arguments: { path: "private-path" } }
  ];
  session.appendMessage(response);
  session.appendMessage({
    role: "toolResult",
    toolCallId: "call",
    toolName: "read",
    content: [{ type: "text", text: "private output" }],
    isError: false,
    timestamp: 2
  });
  session.appendCustomMessageEntry("other", "private extension context", true);
  session.appendMessage({ role: "user", content: "Follow-up", timestamp: 3 });
  const source = conversationSource(session.getBranch());
  expect(source).toMatch(/Opening request[\s\S]*Assistant context[\s\S]*Follow-up/u);

  for (const excluded of [
    "Abandoned branch",
    "private thinking",
    "private-path",
    "private output",
    "private extension context"
  ]) {
    expect(source).not.toContain(excluded);
  }
});

it("bounds the opening request from the front and regeneration from the recent end", () => {
  expect(requestSource("a".repeat(3_999) + "😀tail")).toBe("a".repeat(3_999));
  const session = SessionManager.inMemory();
  session.appendMessage({ role: "user", content: "old opening", timestamp: 0 });
  session.appendMessage({ role: "user", content: "😀" + "b".repeat(3_999), timestamp: 1 });
  expect(conversationSource(session.getBranch())).toBe("b".repeat(3_999));
});
