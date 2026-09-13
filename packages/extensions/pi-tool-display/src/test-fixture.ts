import assert from "node:assert/strict";

import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import { SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

export function renderingTui(): TUI {
  const terminal = { setProgress() {} } satisfies Pick<TUI["terminal"], "setProgress">;
  const tui = { requestRender() {}, terminal } satisfies Pick<TUI, "requestRender"> & {
    terminal: typeof terminal;
  };

  // These row tests only request renders and update progress; they never start a terminal.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return tui as unknown as TUI;
}

export function nativeToolContext(cwd: string): ExtensionContext {
  const context = {
    cwd,
    sessionManager: SessionManager.inMemory(cwd)
  } satisfies Pick<ExtensionContext, "cwd" | "sessionManager">;

  // Native execution reads cwd and session environment, not the rest of the extension host.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return context as unknown as ExtensionContext;
}

export function messageToolCall(message: AssistantMessage, index = 0): ToolCall {
  const content = message.content[index];
  assert(content?.type === "toolCall", `Expected tool call at content index ${index}`);

  return content;
}

export function assistantMessage(
  content: AssistantMessage["content"],
  timestamp = 1
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "fixture",
    model: "offline",
    timestamp,
    stopReason: "toolUse",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  };
}

export function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { type: "toolCall", id, name, arguments: args };
}
