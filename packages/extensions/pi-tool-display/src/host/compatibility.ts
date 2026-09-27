import { createHash } from "node:crypto";

import {
  InteractiveMode,
  type AgentSession,
  type AssistantMessageComponent,
  type ToolExecutionComponent,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import type { DisplayMode } from "../contracts.ts";

/** Last selected mode per interactive host; survives rebinding and extension reloads. */
export const hostMode = Symbol.for("pi-tool-display.mode");

// Private Pi 0.87.1 TUI contracts. Native construction belongs to libs/native-tools.
export type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

export interface Host {
  session: AgentSession;
  ui?: TUI;
  chatContainer?: { children: Component[] };
  toolOutputExpanded?: boolean;
  [hostMode]?: DisplayMode;
  getStartupExpansionState?: (this: Host) => boolean;
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
  toggleToolOutputExpansion?: (this: Host) => void;
  setToolsExpanded?: (this: Host, expanded: boolean) => void;
  showStatus?: (this: Host, message: string) => void;
  switchTuiMode?: (this: Host, ...args: unknown[]) => boolean;
}

// Pi 0.87.1: toggleToolOutputExpansion only negates toolOutputExpanded through
// setToolsExpanded, which updates the header, loaded resources, and chat rows, then
// shows its status. Mode cycling depends on both bodies; recheck on Pi upgrades.
// Hashes cover the unbundled API and the installed CLI's minified build.
const modeHookHashes = {
  toggleToolOutputExpansion: new Set([
    "de91b6264219310ad41fb8984ae6db195a3eeb0850b277ded343063b65882e71",
    "11df26132e3330a855c500dff55bbe2f3d9826fdba338a353502dd727b69e2d7"
  ]),
  setToolsExpanded: new Set([
    "2a09d118eaceb306f5fee34efd7311dd2f17b89b704ee591e4872a7476b18728",
    "d85be3dbecebd5e1573f709505d2a7f1a715c86b8f4e22a1b738f9732caa2a4b"
  ])
};

/** True when a private Pi method's source matches an inspected fingerprint. */
export function inspectedSource(method: unknown, hashes: ReadonlySet<string>): boolean {
  return (
    typeof method === "function" &&
    hashes.has(createHash("sha256").update(method.toString()).digest("hex"))
  );
}

/** True only when both expansion methods match inspected Pi sources. */
export function modeHooksCompatible(host: Host): boolean {
  return (
    typeof host.showStatus === "function" &&
    inspectedSource(host.toggleToolOutputExpansion, modeHookHashes.toggleToolOutputExpansion) &&
    inspectedSource(host.setToolsExpanded, modeHookHashes.setToolsExpanded)
  );
}

export const hostHook = Symbol.for("pi-tool-display.hostIntegration");

export function interactivePrototype(): Host & { [hostHook]?: () => void } {
  // Pi 0.87.1 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}
