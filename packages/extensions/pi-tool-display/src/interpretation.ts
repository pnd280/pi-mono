import { dirname } from "node:path";

import { genericAdapter } from "./adapters/generic.ts";
import {
  isCancelled,
  type BorrowedToolResult,
  type DisplayCall,
  type ExplorationItem,
  type ExplorationScope,
  type McpFacts,
  type Outcome,
  type SummaryCategory,
  type SummaryItem,
  type ToolDisplayAdapter
} from "./contracts.ts";
import { resolveInvocationPath } from "./invocation.ts";
import { fallbackItems } from "./summary/categories.ts";

/**
 * A transcript call, or a standalone render that supplies Pi's flags. Only transcript
 * calls check `supports`: standalone callers assert compatibility with their adapter.
 */
export type InterpretationInput =
  | {
      readonly call: DisplayCall;
      /** Replaces the call's selected adapter, e.g. after its presentation failed. */
      readonly adapter?: ToolDisplayAdapter;
    }
  | {
      readonly call?: undefined;
      readonly name: string;
      readonly adapter: ToolDisplayAdapter;
      readonly args: unknown;
      readonly result: BorrowedToolResult | undefined;
      readonly pending: boolean;
      readonly failed: boolean;
    };

/** Calls group when both their normalized scope and custom title match. */
export type GroupKey = {
  readonly scope: ExplorationScope;
  readonly title: string | undefined;
};

/** What a call means for display. All fields use the same effective adapter. */
export interface CallInterpretation {
  /** The selected display adapter, or generic for unsupported results and failed adapters. */
  readonly adapter: ToolDisplayAdapter;
  /** Argument streaming, queueing, or execution; not proof of execution. */
  readonly pending: boolean;
  /** Cancellation outranks failure; success and unavailable metadata override neither. */
  readonly outcome: Outcome;
  readonly mcp: McpFacts | undefined;
  readonly exploration: readonly ExplorationItem[];
  /** Normalized against the interpretation cwd; undefined excludes the call from groups. */
  readonly group: GroupKey | undefined;
  /** Empty when the call is omitted from run summaries. */
  readonly summaryItems: readonly SummaryItem[];
  readonly summaryCategories: readonly SummaryCategory[];
}

/** Called once per interpretation whose adapter threw; the interpretation continues as generic. */
export type AdapterFailureHandler = (adapter: ToolDisplayAdapter, error: unknown) => void;

export function reportAdapterFailure(
  handler: AdapterFailureHandler | undefined,
  adapter: ToolDisplayAdapter,
  error: unknown
): void {
  try {
    handler?.(adapter, error);
  } catch {
    /* Reporting must not break rendering. */
  }
}

export function sameScope(
  left: ExplorationScope | undefined,
  right: ExplorationScope | undefined
): boolean {
  return left?.kind === right?.kind && left?.value === right?.value;
}

export function sameGroupKey(left: GroupKey | undefined, right: GroupKey | undefined): boolean {
  if (!left || !right) return left === right;

  return left.title === right.title && sameScope(left.scope, right.scope);
}

function normalizedScope(
  scope: ExplorationScope | undefined,
  cwd: string
): ExplorationScope | undefined {
  if (!scope) return undefined;
  if (scope.kind === "filter") return { ...scope };
  const path = resolveInvocationPath(scope.value, cwd);

  return path === undefined
    ? undefined
    : { kind: "directory", value: scope.kind === "file" ? dirname(path) : path };
}

function groupKey(
  items: readonly ExplorationItem[],
  title: string | undefined,
  cwd: string
): GroupKey | undefined {
  const scope = normalizedScope(items[0]?.scope, cwd);
  if (!scope || !items.every((item) => sameScope(scope, normalizedScope(item.scope, cwd))))
    return undefined;

  return { scope, title };
}

const PENDING = new Set(["preparing", "queued", "executing"]);

/**
 * Interpret metadata atomically so a failed callback cannot leave consumers with a
 * mix of specialized and generic facts. The coordinator caches this snapshot; card
 * bodies remain lazy. `cwd` resolves identities without reading files.
 */
export function interpret(
  input: InterpretationInput,
  cwd: string,
  onFailure?: AdapterFailureHandler
): CallInterpretation {
  const call = input.call;
  const owner = call ? call.adapter : input.adapter;
  const selected = input.adapter ?? owner;
  const args = call ? call.args : input.args;
  const result = call ? call.result : input.result;
  const name = call ? call.name : input.name;
  const pending = call ? PENDING.has(call.lifecycle) : input.pending;
  let recorded: Outcome = "success";
  if (call) recorded = call.outcome;
  else if (input.failed) recorded = "failure";

  const derive = (adapter: ToolDisplayAdapter): CallInterpretation => {
    const mcp = adapter.mcp?.(args, result);
    const reported = result && !pending ? adapter.outcome?.(result) : undefined;
    const outcomes = [
      recorded,
      call && isCancelled(call) ? "cancelled" : undefined,
      reported,
      pending ? undefined : mcp?.outcome
    ];
    let outcome: Outcome = "success";
    if (outcomes.includes("cancelled")) outcome = "cancelled";
    else if (
      outcomes.some(
        (value) => value === "failure" || value === "transport-error" || value === "returned-error"
      )
    )
      outcome = "failure";
    else if (outcomes.includes("unavailable")) outcome = "unavailable";
    const exploration = adapter.exploration?.(args, result) ?? [];

    return {
      adapter,
      pending,
      outcome,
      mcp,
      exploration,
      group: groupKey(exploration, adapter.groupTitle, cwd),
      // The selected owner's policy applies even when its presentation falls back.
      summaryItems: owner.omitFromSummary
        ? []
        : (adapter.summaryItems?.(args, { result, change: call?.change, cwd }) ??
          fallbackItems(adapter.family, name, call?.change)),
      summaryCategories: adapter.summaryCategories ?? []
    };
  };

  try {
    return derive(
      call && result && selected.supports?.(args, result) === false ? genericAdapter : selected
    );
  } catch (error) {
    if (selected === genericAdapter) throw error;
    reportAdapterFailure(onFailure, selected, error);

    return derive(genericAdapter);
  }
}
