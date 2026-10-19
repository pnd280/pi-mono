import { createHash } from "node:crypto";

import {
  InteractiveMode,
  ToolExecutionComponent,
  VERSION,
  type AgentSession,
  type AssistantMessageComponent,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { unwrapHook } from "@pi-mono/libs/owned-hooks";

import type { DisplayMode } from "../contracts.ts";

/** Last selected mode per interactive host; survives rebinding and extension reloads. */
export const hostMode = Symbol.for("pi-tool-display.mode");

// Private Pi 1.3.0 TUI contracts. Native construction belongs to libs/native-tools.
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

export const inspectedPiVersion = "1.3.0";

// Host middleware can survive disposal under a later owner's wrapper. Hash the
// recorded predecessor; an unknown endpoint needs the inspected public version.
const hostHookHashes = {
  getRegisteredToolDefinition: new Set([
    "8ca62a31c871eb461056e6f1b6594d8eb52bdf0a3698283e454ae727d68e3040",
    "0afac04ae7511d87483c38b7869aca8ec2a05e3cce767e929faeb3b7fdc5211c"
  ]),
  renderSessionItems: new Set([
    "6518ae5d1cd63dec605194917424e7c5d2750d4469f2179e6f08c80104380af4",
    "4af611aaeca481df44268542a4eb3f18401ec5e003e1df727bdc1c3e2a3f86b7"
  ]),
  handleEvent: new Set([
    "8d10a8c0a05f1147b345e3f5f01a38f57cebcf748f0c3a32323db7d0a67ac515",
    "da4696baee3b1a24a287fe65cf7bf08941d94721b950ed77ffab3bca6f58866e"
  ]),
  addMessageToChat: new Set([
    "b3b9fc70dba971c0997ede539117750afa3cebfc50fe1433bcb8cf21b843b08a",
    "3135ca2024483f79e24350ff523b7e843c0d0c97d85de50db7a40c434fe2aad6"
  ]),
  addCustomEntryToChat: new Set([
    "f4b92d3a5982088767eedb941221b31c2274801cf006dd5a0371e210e9d10d3c",
    "5d22198f060eb5cd402715fe36cf6cff2f74a9ad4f90eae902267607358a8305"
  ]),
  maybeShowThinkingDropNotice: new Set([
    "a36e9fe999cd76ca919acfe21e06f7c5b469467f101ab645f679ac9b93a89138",
    "4e566cbe6135bd62c127d60d408b511cd3b99e8cc075091936b3fb3c08ded286"
  ]),
  addCacheMissNotice: new Set([
    "669a3891916a889a998e68fa7e57b94bf8b6e362592a26e37b15834b83bb9835",
    "6262e89ae7d438f1ec26d80cdf3c0b1b20d9a255d5f5f5b379e29752d6c2c4d2"
  ]),
  addCacheWarmingUsage: new Set([
    "8f05cbd4ee2bcb86c2104b5e0f526bc15bf0d3b070ac51e93bc40b78a513c2ca",
    "a3feb007c168120f6f5b54c5744725d71046c7df5868fe4fed77197c2e20778b"
  ]),
  showExtensionNotify: new Set([
    "63eaaf576b56a2c2a24230e03ac37bdbc801b35ec311bf86654dab584c8a8827",
    "382927d387a1d98b0fa12ab07616938861cebae2f48851b518fd0b75e945931c"
  ]),
  switchTuiMode: new Set([
    "71c592580432ca0373dfd085c2a6649e2a3898e1017a43151dbce8d9e895d3eb",
    "d14d77b49560495945b6fb5f191e480b9dee7c2d0573f664f058680df948d986"
  ]),
  updateThinkingBlockVisibility: new Set([
    "aad47cb6c48552f3ee2b834589531a1d7e483d241cd5f099f3eea0353548264d",
    "c17a6d6916778130004c0017f0f11f307f8ae1e4fb786f38efd6430b259dcc6e"
  ])
};

/** Unknown wrappers are supported only on the inspected Pi version. */
export function hostHooksCompatible(host: Host): boolean {
  return Object.entries(hostHookHashes).every(([name, hashes]) => {
    const method = unwrapHook(Reflect.get(host, name));

    return (
      typeof method === "function" &&
      (inspectedSource(method, hashes) || VERSION === inspectedPiVersion)
    );
  });
}

// Pi 1.3.0: toggleToolOutputExpansion only negates toolOutputExpanded through
// setToolsExpanded, which updates the header, loaded resources, and chat rows, then
// shows its status. Mode cycling depends on both bodies; recheck on Pi upgrades.
// Hashes cover the unbundled API and the installed CLI's minified build. Keep
// .agents/skills/pi-update/scripts/fingerprints.ts in sync with all hashed methods here.
const modeHookHashes = {
  getStartupExpansionState: new Set([
    "b9d237d291a9faf4cac7245a6a6599463f1aeed0c50be71c9d800aed8b9d59cc",
    "6ff56caa2d60337ac39824a0b4c1959c9f58b41e03dbf7dea143cd4332c4e665"
  ]),
  showStatus: new Set([
    "0974240ccfb41624e8a5454564d8abcd2c633416d6d3576a452b243722f40418",
    "ac16eeb745321199b90bf14eb061251773db134040d88ad63dc41b44edd0ec4e"
  ]),
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
    hashes.has(createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex"))
  );
}

/** Expansion and its private startup/status dependencies must match inspected sources. */
export function modeHooksCompatible(host: Host): boolean {
  return Object.entries(modeHookHashes).every(([name, hashes]) =>
    inspectedSource(Reflect.get(host, name), hashes)
  );
}

// Pi 1.3.0: a self-rendered row renders a margin row, selfRenderHeight renderer
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
  // Pi 1.3.0 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}
