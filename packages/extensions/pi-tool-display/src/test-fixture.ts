import assert from "node:assert/strict";

import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import type { KeybindingHints } from "@earendil-works/pi-coding-agent";
import { rgbColor, type TUI } from "@earendil-works/pi-tui";
import { createFixtureMessage } from "@pi-mono/libs/validation/provider";

import type { DisplayTheme } from "./rendering/types.ts";

/** Leaves text unstyled, so the colours that feed diff panel tints never appear in output. */
export const plainTheme: DisplayTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
  style: (text) => text,
  colors: {
    toolPendingBg: rgbColor(0, 0, 0),
    toolDiffContext: rgbColor(128, 128, 128),
    toolDiffAdded: rgbColor(0, 128, 0),
    toolDiffRemoved: rgbColor(128, 0, 0)
  }
};

/** Pi 1.5.0 injects these into render contexts; fixtures show the keybinding ID as its key. */
export const keybindingHints: KeybindingHints = {
  keyText: (keybinding) => keybinding,
  keyHint: (keybinding, description) => `${keybinding} ${description}`
};

export function renderingTui(mode: TUI["mode"] = "fullscreen"): TUI {
  const terminal = { setProgress() {}, setProgramStatus() {} } satisfies Pick<
    TUI["terminal"],
    "setProgress" | "setProgramStatus"
  >;
  const tui = { requestRender() {}, terminal, mode } satisfies Pick<
    TUI,
    "requestRender" | "mode"
  > & {
    terminal: typeof terminal;
  };

  // These row tests only request renders and update progress and program status; they never start a terminal.
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
