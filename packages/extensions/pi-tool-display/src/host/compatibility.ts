import {
  InteractiveMode,
  type AgentSession,
  type AssistantMessageComponent,
  type ToolExecutionComponent,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

// Private Pi 0.87.1 TUI contracts. Native construction belongs to libs/native-tools.
export type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

export interface Host {
  session: AgentSession;
  ui?: TUI;
  chatContainer?: { children: Component[] };
  toolOutputExpanded?: boolean;
  updateThinkingBlockVisibility?: (this: Host) => void;
  streamingComponent?: AssistantMessageComponent;
  addMessageToChat?: (this: Host, message: unknown, options?: unknown) => void;
  addCustomEntryToChat?: (this: Host, entry: unknown) => void;
  getRegisteredToolDefinition: (this: Host, name: string) => RenderDefinition;
  renderSessionItems: (this: Host, items: unknown[], options?: unknown) => void;
  handleEvent: (this: Host, event: AgentSessionEvent) => Promise<void>;
  maybeShowThinkingDropNotice?: (this: Host, message: unknown) => void;
  addCacheMissNotice?: (this: Host, notice: unknown) => void;
  addCacheWarmingUsage?: (this: Host, entry: unknown) => void;
}

export const hostHook = Symbol.for("pi-tool-display.hostIntegration");

export function interactivePrototype(): Host & { [hostHook]?: () => void } {
  // Pi 0.87.1 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}
