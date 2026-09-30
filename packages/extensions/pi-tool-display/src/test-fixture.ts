import assert from "node:assert/strict";

import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import type { TUI } from "@earendil-works/pi-tui";
import { createFixtureMessage } from "@pi-mono/libs/validation/provider";

/** Unstyled theme: rendered rows equal their visible text. */
export const plainTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: (_color: string) => "",
  bold: (text: string) => text
};

export function renderingTui(mode: TUI["mode"] = "fullscreen"): TUI {
  const terminal = { setProgress() {} } satisfies Pick<TUI["terminal"], "setProgress">;
  const tui = { requestRender() {}, terminal, mode } satisfies Pick<
    TUI,
    "requestRender" | "mode"
  > & {
    terminal: typeof terminal;
  };

  // These row tests only request renders and update progress; they never start a terminal.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return tui as unknown as TUI;
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
    ...createFixtureMessage(
      { api: "anthropic-messages", provider: "fixture", id: "offline" },
      timestamp
    ),
    content,
    stopReason: "toolUse"
  };
}
