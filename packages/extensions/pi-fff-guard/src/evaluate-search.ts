import { inspectGitIgnore } from "@pi-mono/libs/git-ignore";
import type { FffToolKind } from "@pi-mono/utils/fff-tools";

import { extractScope, searchInputSchema } from "./targets.ts";

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

// Only scope-affecting arguments belong to ignored-path inspection.
const scopeInputSchema = searchInputSchema.pick({
  pattern: true,
  path: true,
  constraints: true,
  exclude: true
});

function parseSearchInput(input: unknown) {
  const parsed = scopeInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const key = parsed.error.issues[0]?.path[0];
  if (key === "exclude") throw new Error("Invalid FFF exclude: expected a string or string array");

  throw new Error(`Invalid FFF ${String(key ?? "input")}: expected a string`);
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
      const result = await inspectGitIgnore({
        path: target.absolute,
        cwd,
        signal: inspectionSignal,
        timeoutMs: 2000
      });
      if (signal?.aborted) return cancelled;
      if (result.status === "cancelled") throw new Error("inspection timed out");

      if (result.status === "timed-out")
        return { kind: "allow", diagnostic: "Git inspection timed out" };

      if (result.status === "unavailable") {
        const message =
          result.cause instanceof Error ? result.cause.message : "Git inspection failed";

        return { kind: "allow", diagnostic: message.replace(/[\r\n]/g, " ").slice(0, 180) };
      }

      if (result.status === "ignored")
        return {
          kind: "block" as const,
          reason: `${toolName} does not work with Git-ignored paths. Retry with rg or another available tool.`
        };
    }
  } catch (error) {
    if (signal?.aborted) return cancelled;

    let diagnostic = "inspection failed";
    if (controller.signal.aborted) diagnostic = "inspection timed out";
    else if (error instanceof Error)
      diagnostic = error.message.replace(/[\r\n]/g, " ").slice(0, 180);

    return { kind: "allow", diagnostic };
  } finally {
    clearTimeout(timeout);
  }

  return { kind: "allow" };
}
