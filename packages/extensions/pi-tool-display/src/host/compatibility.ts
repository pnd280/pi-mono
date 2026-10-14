import { createHash } from "node:crypto";

import {
  InteractiveMode,
  ToolExecutionComponent,
  type AgentSession,
  type AssistantMessageComponent,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import type { DisplayMode } from "../contracts.ts";

/** Last selected mode per interactive host; survives rebinding and extension reloads. */
export const hostMode = Symbol.for("pi-tool-display.mode");

// Private Pi 1.2.0 TUI contracts. Native construction belongs to libs/native-tools.
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
  showExtensionNotify?: (this: Host, message: string, type?: "info" | "warning" | "error") => void;
  switchTuiMode?: (this: Host, ...args: unknown[]) => boolean;
}

// Pi 1.2.0: toggleToolOutputExpansion only negates toolOutputExpanded through
// setToolsExpanded, which updates the header, loaded resources, and chat rows, then
// shows its status. Mode cycling depends on both bodies; recheck on Pi upgrades.
// Hashes cover the unbundled API and the installed CLI's minified build. Keep
// .agents/skills/pi-update/scripts/fingerprints.ts in sync with all hashed methods here.
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

// Pi 1.2.0: a self-rendered row renders a margin row, selfRenderHeight renderer
// rows, then image rows, and handleMouse subtracts that margin before routing to
// the renderer slots. Row chrome rewrites both; recheck on Pi upgrades.
const rowContractHashes = {
  render: new Set([
    "8f415eac22749a2d13fff5a14223fb98790006d6dd52c0a18769ddaa00d96b3b",
    "7ad4ecd93bf47d5d3b1fd169b40b7b161af8d73ffe11fdd833e2748d55373f6e"
  ]),
  handleMouse: new Set([
    "c91f82035b9efa126ac0050289ec872423f918c5f28e11aeeb65bfdac31fcd79",
    "100c51e29d2341d59c859248c6e9ff6693c1755447b7ed66cada19da6de6b1ce"
  ])
};

/** True only when row rendering and mouse routing match inspected Pi sources. */
export function rowContractCompatible(
  prototype: object = ToolExecutionComponent.prototype
): boolean {
  return (
    inspectedSource(Reflect.get(prototype, "render"), rowContractHashes.render) &&
    inspectedSource(Reflect.get(prototype, "handleMouse"), rowContractHashes.handleMouse)
  );
}

export const hostHook = Symbol.for("pi-tool-display.hostIntegration");

export function interactivePrototype(): Host & { [hostHook]?: () => void } {
  // Pi 1.2.0 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}
