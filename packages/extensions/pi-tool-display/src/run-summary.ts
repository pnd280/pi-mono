import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { relativeDisplayPath } from "@pi-mono/utils/paths";

import type {
  ChangeFact,
  DisplayCall,
  Outcome,
  SummaryCategory,
  SummaryItem,
  SummaryNotice,
  ToolFamily
} from "./contracts.ts";
import { changedLines } from "./diff.ts";
import type { CallInterpretation } from "./interpretation.ts";
import { record } from "./values.ts";

/** Category IDs with this prefix count calls per tool name. */
const TOOL_PREFIX = "other:";

const builtinCategories: ReadonlyMap<string, SummaryCategory> = new Map(
  [
    { id: "create", count: { one: "created {n} file", other: "created {n} files" } },
    { id: "edit", count: { one: "edited {n} file", other: "edited {n} files" } },
    { id: "shell", count: { one: "ran {n} command", other: "ran {n} commands" } },
    { id: "mcp", count: { one: "{n} MCP call", other: "{n} MCP calls" } },
    { id: "search", count: { one: "{n} search", other: "{n} searches" } },
    { id: "list", count: { one: "listed {n} dir", other: "listed {n} dirs" } },
    { id: "read", count: { one: "read {n} file", other: "read {n} files" } }
  ].map((category) => [category.id, category])
);

/** Observed creation counts as created; modifications and unknown history count as edits. */
export function writeCategory(change: ChangeFact | undefined): "create" | "edit" {
  return change?.change === "creation" ? "create" : "edit";
}

/** Adapters without summary items count each call once in their family's category. */
export function fallbackItems(
  family: ToolFamily,
  tool: string,
  change: ChangeFact | undefined
): SummaryItem[] {
  switch (family) {
    case "read":
    case "search":
    case "list":
    case "shell":
    case "edit":
      return [{ category: family }];
    case "write":
      return [{ category: writeCategory(change) }];
    case "invocation":
      return [{ category: `${TOOL_PREFIX}${tool}` }];
  }
}

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
  /** The wording leads with a tool name, which is an identifier rather than a verb. */
  readonly toolNamed: boolean;
};

/** A file that `create` or `edit` items of the run name. */
export type ChangedFile = {
  /** Relative to Pi's cwd when inside it, else absolute. */
  readonly path: string;
  /** A call of the run created the file. */
  readonly created: boolean;
  /** Of the latest call on the file. */
  readonly outcome: Outcome;
  /** Successful calls on the file. */
  readonly changes: number;
  /** Summed over the successful calls on the file; undefined when none succeeded or any lacks a readable patch. */
  readonly lines: { readonly added: number; readonly removed: number } | undefined;
};

export type RunSummary = {
  /** Categories in the order of their first call or notice. */
  readonly segments: readonly SummarySegment[];
  /** In the order of each file's first call. */
  readonly changes: readonly ChangedFile[];
};

/** Built-in, then adapter-declared categories. Other IDs count per tool name. */
function resolveCategory(
  id: string,
  declared: ReadonlyMap<string, SummaryCategory>
): Pick<SummarySegment, "category" | "toolNamed"> {
  const category = builtinCategories.get(id) ?? declared.get(id);
  if (category) return { category, toolNamed: false };
  const name = compactDisplayText(id.slice(TOOL_PREFIX.length));

  return {
    category: {
      id,
      count: { one: `${name} ×{n}`, other: `${name} ×{n}` }
    },
    toolNamed: true
  };
}

export function counts(states: readonly Outcome[]): SummaryCounts {
  const count = (state: Outcome) => states.filter((value) => value === state).length;

  return {
    failed: count("failure"),
    cancelled: count("cancelled"),
    unavailable: count("unavailable")
  };
}

/** Line counts after one more successful call: undefined once any successful call on the file has none. */
function addedLines(
  previous: ChangedFile | undefined,
  lines: ChangedFile["lines"]
): ChangedFile["lines"] {
  if (!previous || previous.changes === 0) return lines;
  if (!lines || !previous.lines) return undefined;

  return {
    added: previous.lines.added + lines.added,
    removed: previous.lines.removed + lines.removed
  };
}

/** The files that the calls' `create` and `edit` items name, without reading them. */
function changedFiles(
  members: readonly DisplayCall[],
  cwd: string,
  interpretation: (call: DisplayCall) => CallInterpretation
): ChangedFile[] {
  // Keyed by resolved path, so a file that is created and then edited is one entry.
  const files = new Map<string, ChangedFile>();

  for (const call of members) {
    const { adapter, outcome, summaryItems } = interpretation(call);
    const changed = summaryItems.flatMap(({ category, path }) =>
      path !== undefined && (category === "create" || category === "edit")
        ? [{ path, created: category === "create" }]
        : []
    );
    const succeeded = outcome === "success";
    const lines = succeeded
      ? changedLines(adapter.patch ? record(call.result?.details).patch : undefined, call.change)
      : undefined;

    for (const { path, created } of changed) {
      const previous = files.get(path);

      files.set(path, {
        path: relativeDisplayPath(path, cwd),
        created: created || previous?.created === true,
        outcome,
        changes: (previous?.changes ?? 0) + (succeeded ? 1 : 0),
        lines: succeeded ? addedLines(previous, lines) : previous?.lines
      });
    }
  }

  return [...files.values()];
}

/**
 * Pure: derive a run's summary from calls and their following notices without touching files. `cwd` only shortens the paths of changed files.
 */
export function buildRunSummary(
  members: readonly DisplayCall[],
  cwd: string,
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
      ...resolveCategory(id, declared),
      count: entries.size,
      counts: counts([...entries.values()])
    })),
    changes: changedFiles(members, cwd, interpretation)
  };
}
