import { createHash } from "node:crypto";

import { AgentSession, type ToolDefinition } from "@earendil-works/pi-coding-agent";

// Private Pi contracts, gated by both API and installed-CLI fingerprints.
// docs/pi-compatibility.md records the last verified Pi version.
export type SessionInternals = {
  _cwd: string;
  _baseToolsOverride?: unknown;
  _baseToolDefinitions: Map<string, ToolDefinition>;
  _customTools: ToolDefinition[];
  _buildRuntime: (this: AgentSession, options: unknown) => void;
  _refreshToolRegistry: (this: AgentSession, options?: unknown) => void;
};

export function unchangedDefinition(definition: ToolDefinition, fields: ToolDefinition): boolean {
  return (
    Object.keys(definition).length === Object.keys(fields).length &&
    Object.keys(fields).every((key) => Reflect.get(definition, key) === Reflect.get(fields, key))
  );
}

// Construction fingerprints establish this private boundary before any replacement.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const nativeSession = (session: AgentSession) => session as unknown as SessionInternals;

// Keep .agents/skills/pi-update/scripts/fingerprints.ts in sync with these methods.
const constructionHashes = [
  {
    _buildRuntime: "a3ab89260460277fd6dff8c9f076bf16cf9e1a877ca5fbba63ac7f7cb93eb1d4",
    _refreshToolRegistry: "03dee007ef4fbc859a9596b56ec850eb0a2f815aed5b65877019ec973ac95bc8"
  },
  {
    _buildRuntime: "57071583e66ab338901f8759fe368d077c7ebb5792ee6749a8a5954a6c5a6dd1",
    _refreshToolRegistry: "6e3083f2a01a3851bab834b03aba6ee927dba177205c57d3e2871767ed224a0e"
  }
];

export function inspectedConstruction(prototype: SessionInternals): boolean {
  return constructionHashes.some((expected) =>
    Object.entries(expected).every(([key, hash]) => {
      const method: unknown = Reflect.get(prototype, key);

      return (
        typeof method === "function" &&
        createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex") === hash
      );
    })
  );
}

export function nativePrototype(): SessionInternals {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return AgentSession.prototype as unknown as SessionInternals;
}
