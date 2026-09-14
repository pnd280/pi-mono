import type { FffToolKind } from "@pi-mono/utils/fff-tools";

import { detectIgnored } from "./git-ignore.ts";
import { extractScope, type SearchInput } from "./targets.ts";

export type SearchDecision =
  | { kind: "block"; reason: string }
  | { kind: "allow"; diagnostic?: string };

type SearchRequest = {
  kind: FffToolKind;
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  signal?: AbortSignal | undefined;
};

function parseSearchInput(input: Record<string, unknown>): SearchInput {
  const scope: SearchInput = {};

  for (const key of ["pattern", "path", "constraints"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new Error(`Invalid FFF ${key}: expected a string`);
    scope[key] = value;
  }

  const exclude = input.exclude;

  if (exclude !== undefined) {
    if (
      typeof exclude !== "string" &&
      !(Array.isArray(exclude) && exclude.every((entry: unknown) => typeof entry === "string"))
    )
      throw new Error("Invalid FFF exclude: expected a string or string array");
    scope.exclude = exclude;
  }

  return scope;
}

/** Inspection policy without Pi registration or notification delivery. */
export async function evaluateSearch({
  kind,
  toolName,
  input,
  cwd,
  signal
}: SearchRequest): Promise<SearchDecision> {
  const cancelled = {
    kind: "block" as const,
    reason: "Ignored-path detection cancelled; no replacement search was started."
  };
  if (signal?.aborted) return cancelled;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  const inspectionSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const scopeInput = parseSearchInput(input);
    const scope = await extractScope(kind, scopeInput, cwd, inspectionSignal);
    inspectionSignal.throwIfAborted();
    if (scope.missingPath) return { kind: "block" as const, reason: "No such file or directory" };
    const inspected = new Set<string>();

    for (const target of scope.targets) {
      inspectionSignal.throwIfAborted();
      if (inspected.has(target.absolute)) continue;
      inspected.add(target.absolute);
      const result = await detectIgnored(target.absolute, cwd, inspectionSignal);
      if (signal?.aborted) return cancelled;
      if (result.status === "cancelled") throw new Error("inspection timed out");

      if (result.status === "unavailable") {
        return { kind: "allow", diagnostic: result.diagnostic };
      }

      if (result.status === "ignored")
        return {
          kind: "block" as const,
          reason: `${toolName} does not work with Git-ignored paths. Retry with rg or another available tool.`
        };
    }
  } catch (error) {
    if (signal?.aborted) return cancelled;

    return {
      kind: "allow",
      diagnostic: controller.signal.aborted
        ? "inspection timed out"
        : error instanceof Error
          ? error.message.replace(/[\r\n]/g, " ").slice(0, 180)
          : "inspection failed"
    };
  } finally {
    clearTimeout(timeout);
  }

  return { kind: "allow" };
}
