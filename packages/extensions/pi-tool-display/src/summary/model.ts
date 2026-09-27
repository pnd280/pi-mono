import { resolveResultAdapter } from "../adapters/generic.ts";
import type {
  DisplayCall,
  Outcome,
  SummaryCategory,
  SummaryItem,
  ToolDisplayAdapter
} from "../contracts.ts";
import { callOutcome } from "../rendering/outcome.ts";
import { builtinCategories, fallbackItems, resolveCategory } from "./categories.ts";

export type SummaryCounts = {
  readonly failed: number;
  readonly cancelled: number;
  readonly unavailable: number;
};

/** One rendered item: a category's counted entries. Problems qualify it; they never reorder it. */
export type SummarySegment = {
  readonly category: SummaryCategory;
  /** Distinct identities plus calls without one. */
  readonly count: number;
  readonly counts: SummaryCounts;
};

export type RunSummary = {
  /** Categories in the order of their first call. */
  readonly segments: readonly SummarySegment[];
};

function items(
  call: DisplayCall,
  adapter: ToolDisplayAdapter,
  cwd: string
): readonly SummaryItem[] {
  let supplied: readonly SummaryItem[] | undefined;

  try {
    supplied = adapter.summaryItems?.(call.args, {
      result: call.result,
      change: call.change,
      cwd
    });
  } catch {
    supplied = undefined;
  }

  // An empty list omits the call; undefined falls back to the family's category.
  return supplied ?? fallbackItems(adapter.family, call.name, call.change);
}

function counts(states: readonly Outcome[]): SummaryCounts {
  const count = (state: Outcome) => states.filter((value) => value === state).length;

  return {
    failed: count("failure"),
    cancelled: count("cancelled"),
    unavailable: count("unavailable")
  };
}

/** Pure: derive a run's summary from borrowed call state without touching files. */
export function buildRunSummary(members: readonly DisplayCall[], cwd: string): RunSummary {
  const declared = new Map<string, SummaryCategory>();
  // Latest state per entry key, per category; Map order is first appearance.
  const categories = new Map<string, Map<string, Outcome>>();

  for (const call of members) {
    const adapter = resolveResultAdapter(call.adapter, call.args, call.result);
    const supplied = items(call, adapter, cwd);
    if (!supplied.length) continue;

    for (const category of adapter.summaryCategories ?? [])
      if (!builtinCategories.has(category.id) && !declared.has(category.id))
        declared.set(category.id, category);

    const state = callOutcome(call);

    supplied.forEach((item, position) => {
      const entries = categories.get(item.category) ?? new Map<string, Outcome>();
      categories.set(item.category, entries);
      const key =
        item.identity === undefined ? `call\0${call.key}\0${position}` : `id\0${item.identity}`;
      // Only the latest outcome per identity counts: a later success clears a failure.
      entries.set(key, state);
    });
  }

  return {
    segments: [...categories].map(([id, entries]) => ({
      category: resolveCategory(id, declared),
      count: entries.size,
      counts: counts([...entries.values()])
    }))
  };
}
