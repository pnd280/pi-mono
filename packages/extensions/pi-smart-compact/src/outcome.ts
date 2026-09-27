import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import type { NativeSession } from "./compatibility.ts";
import { runWithOverrides, type CompactionModelOptions } from "./summarize.ts";

export const compactionResultType = "pi-smart-compact.result";

export type CompactionOutcome =
  | { status: "completed" }
  | { status: "skipped"; reason: string }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

type CompactionEnd = Extract<AgentSessionEvent, { type: "compaction_end" }>;

function fromEvent(event: CompactionEnd): CompactionOutcome {
  if (event.result) return { status: "completed" };
  if (event.aborted) return { status: "cancelled" };

  return {
    status: "failed",
    error: event.errorMessage?.replace(/^Auto-compaction failed: /u, "") ?? "Unknown error"
  };
}

export function describeOutcome(
  outcome: Exclude<CompactionOutcome, { status: "completed" }>
): string {
  switch (outcome.status) {
    case "skipped":
      return `Compaction skipped: ${outcome.reason} Existing context was preserved.`;
    case "cancelled":
      return "Compaction cancelled. Existing context was preserved.";
    case "failed":
      return `Compaction failed: ${outcome.error}\nExisting context was preserved.`;
  }
}

export async function runRequestedCompaction(
  session: NativeSession,
  instructions?: string,
  selection?: CompactionModelOptions
): Promise<CompactionOutcome> {
  let outcome: CompactionOutcome | undefined;
  // Native preparation can return early or swallow an error without emitting an
  // event. Its boolean signals queued continuation, not success or a skip reason.
  let skippedReason = "Pi did not start compaction.";
  if (!session.model) skippedReason = "No model selected.";
  else if (session.sessionManager.getBranch().at(-1)?.type === "compaction")
    skippedReason = "Already compacted.";

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "compaction_end" && event.reason === "manual") outcome = fromEvent(event);
  });

  try {
    if (
      instructions === undefined &&
      selection?.config.model === undefined &&
      selection?.config.thinkingLevel === undefined
    )
      await session._runAutoCompaction("manual", false);
    else await runWithOverrides(session, instructions, selection);

    return outcome ?? { status: "skipped", reason: skippedReason };
  } finally {
    unsubscribe();
  }
}
