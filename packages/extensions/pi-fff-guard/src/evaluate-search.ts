import { raceWithAbortSignal } from "@earendil-works/pi-ai/utils/abort";
import type { FffToolKind } from "@pi-mono/utils/fff-tools";

import { inspectGitIgnore, type GitIgnoreResult } from "./git-ignore.ts";
import { extractScope } from "./targets.ts";

type SearchDecision = { kind: "block"; reason: string } | { kind: "allow"; diagnostic?: string };

type SearchRequest = {
  kind: FffToolKind;
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  signal?: AbortSignal | undefined;
};

function inspectionDecision(result: GitIgnoreResult, toolName: string): SearchDecision {
  switch (result.status) {
    case "cancelled":
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
      return { kind: "allow" };

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

  let diagnostic: string | undefined;

  try {
    const scope = await raceWithAbortSignal(
      extractScope(kind, input, cwd, inspectionSignal),
      inspectionSignal
    );
    inspectionSignal.throwIfAborted();
    if (scope.missing) return { kind: "block", reason: "No such file or directory" };

    for (const targetPath of scope.paths) {
      inspectionSignal.throwIfAborted();
      const result = await raceWithAbortSignal(
        inspectGitIgnore({ path: targetPath, cwd, signal: inspectionSignal }),
        inspectionSignal
      );
      if (signal?.aborted) return cancelled;
      const decision = inspectionDecision(result, toolName);
      if (decision.kind === "block") return decision;

      // One failed inspection must not hide another target's definite block.
      diagnostic ??= decision.diagnostic;
    }
  } catch (error) {
    if (signal?.aborted) return cancelled;

    let failure = "inspection failed";
    if (controller.signal.aborted) failure = "inspection timed out";
    else if (error instanceof Error) failure = error.message.replace(/[\r\n]/g, " ").slice(0, 180);

    return { kind: "allow", diagnostic: failure };
  } finally {
    clearTimeout(timeout);
  }

  return diagnostic ? { kind: "allow", diagnostic } : { kind: "allow" };
}
