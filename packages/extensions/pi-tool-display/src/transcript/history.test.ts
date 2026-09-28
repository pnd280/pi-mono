import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { assistantMessage } from "../test-fixture.ts";
import { DisplayHistory } from "./history.ts";

it("tracks appended source entries and drops timestamps outside the selected ancestry", () => {
  const manager = SessionManager.inMemory();
  const root = manager.appendMessage(assistantMessage([], 1));
  const history = new DisplayHistory(manager);
  expect(history.messageEntry(1)).toBe(root);
  const previous = manager.appendMessage(assistantMessage([], 2));
  expect(history.messageEntry(2)).toBe(previous);
  expect(history.messageEntry(1)).toBe(root);

  manager.branch(root);
  const sibling = manager.appendMessage(assistantMessage([], 3));
  expect(history.messageEntry(2)).toBeUndefined();
  expect(history.messageEntry(3)).toBe(sibling);
  expect(history.messageEntry(1)).toBe(root);
  const replacement = manager.appendMessage(assistantMessage([], 2));
  expect(history.messageEntry(2)).toBe(replacement);

  manager.resetLeaf();
  for (const timestamp of [1, 2, 3]) expect(history.messageEntry(timestamp)).toBeUndefined();
  manager.branch(previous);
  expect(history.messageEntry(1)).toBe(root);
  expect(history.messageEntry(2)).toBe(previous);
  expect(history.messageEntry(3)).toBeUndefined();
});
