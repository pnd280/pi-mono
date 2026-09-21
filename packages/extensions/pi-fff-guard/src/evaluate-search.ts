import { inspectGitIgnore, type GitIgnoreResult } from "@pi-mono/libs/git-ignore";
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

function settleOnAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);

    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function inspectionDecision(result: GitIgnoreResult, toolName: string): SearchDecision | undefined {
  switch (result.status) {
    case "cancelled":
    case "timed-out":
      return { kind: "allow", diagnostic: "Git inspection timed out" };
    case "missing":
      return { kind: "block", reason: "No such file or directory" };

    case "unavailable":
      return { kind: "allow", diagnostic: "Git inspection failed" };

    case "ignored":
      return {
        kind: "block",
        reason: `${toolName} does not work with Git-ignored paths. Retry with rg or another available tool.`
      };
    case "not-ignored":
      return undefined;

    default:
      result satisfies never;
      throw new Error("unexpected Git inspection result");
  }
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
    const scope = await settleOnAbort(
      extractScope(kind, scopeInput, cwd, inspectionSignal),
      inspectionSignal
    );
    inspectionSignal.throwIfAborted();
    if (scope.missingPath) return { kind: "block" as const, reason: "No such file or directory" };
    const inspected = new Set<string>();

    for (const target of scope.targets) {
      inspectionSignal.throwIfAborted();
      if (inspected.has(target.absolute)) continue;
      inspected.add(target.absolute);
      const result = await settleOnAbort(
        inspectGitIgnore({
          path: target.absolute,
          cwd,
          signal: inspectionSignal,
          timeoutMs: 2000
        }),
        inspectionSignal
      );
      if (signal?.aborted) return cancelled;
      const decision = inspectionDecision(result, toolName);

      if (decision) return decision;
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
