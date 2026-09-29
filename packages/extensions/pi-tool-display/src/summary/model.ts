import type { DisplayCall, Outcome, SummaryCategory, SummaryNotice } from "../contracts.ts";
import type { CallInterpretation } from "../interpretation.ts";
import { builtinCategories, resolveCategory } from "./categories.ts";

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
  /** Categories in the order of their first call or notice. */
  readonly segments: readonly SummarySegment[];
};

function counts(states: readonly Outcome[]): SummaryCounts {
  const count = (state: Outcome) => states.filter((value) => value === state).length;

  return {
    failed: count("failure"),
    cancelled: count("cancelled"),
    unavailable: count("unavailable")
  };
}

/** Pure: derive a run's summary from calls and their following notices without touching files. */
export function buildRunSummary(
  members: readonly DisplayCall[],
  interpretation: (call: DisplayCall) => CallInterpretation,
  notices: (call: DisplayCall) => readonly SummaryNotice[] = () => []
): RunSummary {
  const declared = new Map<string, SummaryCategory>();
  // Latest state per entry key, per category; Map order is first appearance.
  const categories = new Map<string, Map<string, Outcome>>();

  const declare = (category: SummaryCategory) => {
    if (!builtinCategories.has(category.id) && !declared.has(category.id))
      declared.set(category.id, category);
  };

  const add = (category: string, key: string, outcome: Outcome) => {
    const entries = categories.get(category) ?? new Map<string, Outcome>();
    categories.set(category, entries);
    // Only the latest outcome per identity counts: a later success clears a failure.
    entries.set(key, outcome);
  };

  for (const call of members) {
    const interpreted = interpretation(call);
    // An empty list omits the call, but not its notices.
    const supplied = interpreted.summaryItems;
    if (supplied.length) interpreted.summaryCategories.forEach(declare);

    supplied.forEach((item, position) => {
      const key =
        item.identity === undefined ? `call\0${call.key}\0${position}` : `id\0${item.identity}`;
      add(item.category, key, interpreted.outcome);
    });

    for (const notice of notices(call)) {
      declare(notice.category);
      add(notice.category.id, `notice\0${notice.identity}`, "success");
    }
  }

  return {
    segments: [...categories].map(([id, entries]) => ({
      category: resolveCategory(id, declared),
      count: entries.size,
      counts: counts([...entries.values()])
    }))
  };
}
