import {
  InteractiveMode,
  ToolExecutionComponent,
  type AgentSession,
  type AssistantMessageComponent,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { hookCompatible, inspectedSource } from "@pi-mono/libs/owned-hooks";

import type { DisplayMode } from "../contracts.ts";

/** Last selected mode per interactive host; survives rebinding and extension reloads. */
export const hostMode = Symbol.for("pi-tool-display.mode");

/** Private Pi 1.5.2 TUI contracts. Native construction belongs to libs/native-tools. */
export type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

export type Host = {
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
  renderSessionItems: (
    this: Host,
    items: unknown[],
    messageMeta?: unknown,
    options?: unknown
  ) => void;
  handleEvent: (this: Host, event: AgentSessionEvent) => Promise<void>;
  maybeShowThinkingDropNotice?: (this: Host, message: unknown) => void;
  addCacheMissNotice?: (this: Host, notice: unknown) => void;
  addCacheWarmingUsage?: (this: Host, entry: unknown) => void;
  toggleToolOutputExpansion?: (this: Host) => void;
  setToolsExpanded?: (this: Host, expanded: boolean) => void;
  showStatus?: (this: Host, message: string) => void;
  showExtensionNotify?: (this: Host, message: string, type?: "info" | "warning" | "error") => void;
  switchTuiMode?: (this: Host, ...args: unknown[]) => boolean;
};

export const inspectedPiVersion = "1.5.2";

// Host middleware can survive disposal under a later owner's wrapper. Hash the recorded predecessor; an unknown endpoint needs the inspected public version.
const hostHookHashes = {
  getRegisteredToolDefinition: new Set([
    "8ca62a31c871eb461056e6f1b6594d8eb52bdf0a3698283e454ae727d68e3040",
    "0afac04ae7511d87483c38b7869aca8ec2a05e3cce767e929faeb3b7fdc5211c"
  ]),
  renderSessionItems: new Set([
    "70a66c333969e615c0ccc412de50857b5eb328ee70a76f096ea400f3e807982a",
    "b77e207e823c93abf621028aa6d854dfae138605f7930c3a84bffff2235dc9af"
  ]),
  handleEvent: new Set([
    "bbd5aa0d9714c6bffc75d44aae21048f07d3b5030336143f87a99b996ee581ef",
    "083d0f1e595cb1f4065647098420df3ca525ef18289b36ef7bc66111ddf0b076"
  ]),
  addMessageToChat: new Set([
    "a40a8f6477fefd716c464fe007df3f0baeb88a4cc69a4069c0c6c9cff7116380",
    "254e75b5cd4d9d706b5d837d8e7f8b4fe9ac08624e06c52e65febfc4d8ec330c"
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
    "4d0255af5a1130d688240549208a7f9c22175a3863dfd0ba6a3ead36e4747f3b",
    "a42feaf5076aa7a24dee7c61873bbdf71f20ac32bec9edc4f44e8f2f6a111126"
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
export function hostHooksCompatible<H extends Host>(
  host: H
): host is H & Required<Pick<Host, keyof typeof hostHookHashes>> {
  return Object.entries(hostHookHashes).every(([name, hashes]) =>
    hookCompatible(Reflect.get(host, name), hashes, inspectedPiVersion)
  );
}

// Pi 1.5.2: toggleToolOutputExpansion only negates toolOutputExpanded through setToolsExpanded, which updates the header, loaded resources, and chat and pending rows, then shows its status. Mode cycling depends on both bodies; recheck on upgrades. Hashes cover the unbundled API and minified installed CLI. Keep .agents/skills/pi-update/scripts/fingerprints.ts in sync with the methods hashed here.
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
    "e8f44ff247c4643aac2b92c0c75cec5d95eaec7593925821bedd28a527511525",
    "90657218f5fe0c5f73c81b5925d3f5690b4084dcb25439614b71ae822a8db6ed"
  ])
};

/** Expansion and its private startup/status dependencies must match inspected sources. */
export function modeHooksCompatible(host: Host): boolean {
  return Object.entries(modeHookHashes).every(([name, hashes]) =>
    inspectedSource(Reflect.get(host, name), hashes)
  );
}

// Pi 1.5.2: ToolExecutionComponent.render first applies pending streamed arguments, then a self-rendered row renders a margin row, selfRenderHeight renderer rows, then image rows, and handleMouse subtracts that margin before routing to the renderer slots. Row chrome rewrites both; recheck on Pi upgrades.
const rowContractHashes = {
  render: new Set([
    "c0354d5eabb5e310a3b96860777415b3f364b2614cb2eafbd66955ab5e4a880d",
    "585cddc903a64a876078948a265c95fa63932e311680e17f69a0acdf26cb20a2"
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
  // Pi 1.5.2 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}
