import { fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { assistantMessage } from "../test-fixture.ts";
import { DisplayHistory } from "./history.ts";

it("tracks appended source entries and drops timestamps outside the selected ancestry", () => {
  const manager = SessionManager.inMemory();
  const message = (timestamp: number) =>
    assistantMessage([fauxToolCall("bash", {}, { id: `call-${timestamp}` })], timestamp);
  const locate = (history: DisplayHistory, timestamp: number) =>
    history.messageEntry(timestamp, 0, `call-${timestamp}`);
  const root = manager.appendMessage(message(1));
  const history = new DisplayHistory(manager);
  expect(locate(history, 1)).toBe(root);
  const previous = manager.appendMessage(message(2));
  expect(locate(history, 2)).toBe(previous);
  expect(locate(history, 1)).toBe(root);

  manager.branch(root);
  const sibling = manager.appendMessage(message(3));
  expect(locate(history, 2)).toBeUndefined();
  expect(locate(history, 3)).toBe(sibling);
  expect(locate(history, 1)).toBe(root);
  const replacement = manager.appendMessage(message(2));
  expect(locate(history, 2)).toBe(replacement);

  manager.resetLeaf();
  for (const timestamp of [1, 2, 3]) expect(locate(history, timestamp)).toBeUndefined();
  manager.branch(previous);
  expect(locate(history, 1)).toBe(root);
  expect(locate(history, 2)).toBe(previous);
  expect(locate(history, 3)).toBeUndefined();
});
