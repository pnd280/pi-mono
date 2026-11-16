import {
  calculateContextTokens,
  type ContextUsage,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";

import { contextStatusSchema, contextStatusType, type ContextStatusDetails } from "./result.ts";

/** The model of the latest response with usage, which is where Pi's count starts. */
function countingModel(branch: readonly SessionEntry[]) {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    const { message } = entry;
    if (
      message.stopReason !== "aborted" &&
      message.stopReason !== "error" &&
      calculateContextTokens(message.usage) > 0
    )
      return `${message.provider}/${message.model}`;
  }

  return undefined;
}

/** The step of the latest status since the last compaction, or 0 when its count is not comparable with the current one. */
function reportedStep(
  branch: readonly SessionEntry[],
  step: number,
  model: string,
  countedBy: string | undefined
) {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type === "compaction") return 0;
    if (entry?.type !== "custom_message" || entry.customType !== contextStatusType) continue;
    const status = contextStatusSchema.safeParse(entry.details).data;

    // Tokenisers differ, so a count compares only under the same conversation model, and only on the same side of that model's first counted response. A virtual model's responses name physical models, so it is never on the counted side and keeps one step across routes.
    return status?.model === model && (status.countedBy === model) === (countedBy === model)
      ? Math.floor(status.tokens / step)
      : 0;
  }

  return 0;
}

/**
 * The status message to append when usage is past a `step` boundary that the branch has not reported, in the shape of a `before_agent_start` message. The text is the `context_window` result.
 */
export function contextStatus(
  branch: readonly SessionEntry[],
  usage: ContextUsage | undefined,
  model: { provider: string; id: string } | undefined,
  step: number
) {
  if (!step || !model || !usage || usage.tokens === null || usage.percent === null)
    return undefined;
  const reference = `${model.provider}/${model.id}`;
  const countedBy = countingModel(branch);
  if (Math.floor(usage.tokens / step) <= reportedStep(branch, step, reference, countedBy))
    return undefined;

  return {
    customType: contextStatusType,
    content: `Context usage: ${JSON.stringify(usage)}`,
    display: true,
    details: {
      tokens: usage.tokens,
      contextWindow: usage.contextWindow,
      percent: usage.percent,
      model: reference,
      ...(countedBy === undefined ? {} : { countedBy })
    } satisfies ContextStatusDetails
  };
}
