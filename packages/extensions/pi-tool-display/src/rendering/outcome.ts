import { resolveResultAdapter } from "../adapters/generic.ts";
import { isCancelled, type DisplayCall, type Outcome } from "../contracts.ts";
import type { Projection } from "./types.ts";

/** Published and observed terminal states outrank missing adapter metadata. */
export function displayOutcome(
  p: Pick<Projection, "call" | "adapter" | "result" | "mcp"> & {
    context: Pick<Projection["context"], "isError" | "isPartial">;
  }
): Outcome {
  const outcomes = [
    p.call?.outcome ?? (p.context.isError ? "failure" : "success"),
    p.call && isCancelled(p.call) ? "cancelled" : undefined,
    p.result && !p.context.isPartial ? p.adapter.outcome?.(p.result) : undefined,
    !p.context.isPartial ? p.mcp?.outcome : undefined
  ];
  if (outcomes.includes("cancelled")) return "cancelled";
  if (
    outcomes.some(
      (outcome) =>
        outcome === "failure" || outcome === "transport-error" || outcome === "returned-error"
    )
  )
    return "failure";
  if (outcomes.includes("unavailable")) return "unavailable";

  return "success";
}

export function callOutcome(call: DisplayCall): Outcome {
  const adapter = resolveResultAdapter(call.adapter, call.args, call.result);

  return displayOutcome({
    call,
    adapter,
    result: call.result,
    context: {
      isError: false,
      isPartial: call.lifecycle !== "complete" && call.lifecycle !== "unavailable"
    },
    mcp: adapter.mcp?.(call.args, call.result)
  });
}
