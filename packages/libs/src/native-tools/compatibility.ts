import { createHash } from "node:crypto";

import { AgentSession, type ToolDefinition } from "@earendil-works/pi-coding-agent";

// Private Pi 0.87.1 contracts, gated by both API and installed-CLI fingerprints.
export interface SessionInternals {
  _cwd: string;
  _baseToolsOverride?: unknown;
  _baseToolDefinitions: Map<string, ToolDefinition>;
  _customTools: ToolDefinition[];
  _buildRuntime: (this: AgentSession, options: unknown) => void;
  _refreshToolRegistry: (this: AgentSession, options?: unknown) => void;
}

export function unchangedDefinition(definition: ToolDefinition, fields: ToolDefinition): boolean {
  return (
    Object.keys(definition).length === Object.keys(fields).length &&
    Object.keys(fields).every((key) => Reflect.get(definition, key) === Reflect.get(fields, key))
  );
}

// Construction fingerprints establish this private boundary before any replacement.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const nativeSession = (session: AgentSession) => session as unknown as SessionInternals;

const constructionHashes = [
  {
    _buildRuntime: "a3ab89260460277fd6dff8c9f076bf16cf9e1a877ca5fbba63ac7f7cb93eb1d4",
    _refreshToolRegistry: "d29320d86ee266c910bb7e06774d49ecd8bb4c37e9006caa113f6472ab554818"
  },
  {
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

export function nativePrototype(): SessionInternals {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return AgentSession.prototype as unknown as SessionInternals;
}
