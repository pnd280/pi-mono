import { createHash } from "node:crypto";

import {
  AgentSession,
  InteractiveMode,
  type AssistantMessageComponent,
  type ToolExecutionComponent,
  type AgentSessionEvent,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

// Private Pi 0.85.1 contracts. Only host modules may access these fields.
export type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

export interface SessionInternals {
  _cwd: string;
  _baseToolsOverride?: unknown;
  _baseToolDefinitions: Map<string, ToolDefinition>;
  _customTools: ToolDefinition[];
  _buildRuntime: (this: AgentSession, options: unknown) => void;
  _refreshToolRegistry: (this: AgentSession, options?: unknown) => void;
}

export interface Host {
  session: AgentSession;
  ui?: TUI;
  chatContainer?: { children: Component[] };
  toolOutputExpanded?: boolean;
  streamingComponent?: AssistantMessageComponent;
  addMessageToChat?: (this: Host, message: unknown, options?: unknown) => void;
  addCustomEntryToChat?: (this: Host, entry: unknown) => void;
  getRegisteredToolDefinition: (this: Host, name: string) => RenderDefinition;
  renderSessionItems: (this: Host, items: unknown[], options?: unknown) => void;
  handleEvent: (this: Host, event: AgentSessionEvent) => Promise<void>;
  maybeShowAssistantDiagnostics?: (this: Host, message: unknown) => void;
  addCacheMissNotice?: (this: Host, notice: unknown) => void;
}

export function unchangedDefinition(definition: ToolDefinition, fields: ToolDefinition): boolean {
  return (
    Object.keys(definition).length === Object.keys(fields).length &&
    Object.keys(fields).every((key) => Reflect.get(definition, key) === Reflect.get(fields, key))
  );
}

// Pi 0.85.1 declares these registry fields private. The construction fingerprints below
// gate observation; retaining this explicit boundary also permits conditional restoration.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const nativeSession = (session: AgentSession) => session as unknown as SessionInternals;

// Factory closures hide their operations. Only Pi 0.85.1's inspected construction
// path establishes their settings; a pre-existing private wrapper is not evidence.
const constructionHashes = [
  {
    // Unbundled public API (dist/index.js).
    _buildRuntime: "a3ab89260460277fd6dff8c9f076bf16cf9e1a877ca5fbba63ac7f7cb93eb1d4",
    _refreshToolRegistry: "d29320d86ee266c910bb7e06774d49ecd8bb4c37e9006caa113f6472ab554818"
  },
  {
    // Published `pi` executable (dist/bundle/cli.js). Its extension imports use
    // the bundled classes, whose minified method bodies differ from the API.
    _buildRuntime: "0d5522f8f4e0dbe3fe7df897771cb738030377dccd69a27bcf44ffba8385c6e7",
    _refreshToolRegistry: "c7036f01afe7e60bf5556779e4c0b5f1c34ae6ea04eb937302c83bd0ed734e89"
  }
];

export function inspectedConstruction(prototype: SessionInternals): boolean {
  return constructionHashes.some((expected) =>
    Object.entries(expected).every(([key, hash]) => {
      const method: unknown = Reflect.get(prototype, key);

      return (
        typeof method === "function" &&
        createHash("sha256").update(method.toString()).digest("hex") === hash
      );
    })
  );
}

export const hostHook = Symbol.for("pi-tool-display.hostIntegration");

export function interactivePrototype(): Host & { [hostHook]?: () => void } {
  // Pi 0.85.1 private methods are checked before installing any wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return InteractiveMode.prototype as unknown as Host & { [hostHook]?: () => void };
}

export function nativePrototype(): SessionInternals {
  // Construction hashes establish the inspected private registry contract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return AgentSession.prototype as unknown as SessionInternals;
}
