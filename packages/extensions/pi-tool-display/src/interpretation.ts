import { dirname } from "node:path";

import { genericAdapter } from "./adapters/generic.ts";
import {
  isCancelled,
  type BorrowedToolResult,
  type DisplayCall,
  type DisplayAction,
  type ExplorationItem,
  type ExplorationScope,
  type McpFacts,
  type Outcome,
  type SummaryCategory,
  type SummaryItem,
  type ToolDisplayAdapter
} from "./contracts.ts";
import { resolveInvocationPath } from "./invocation.ts";
import { fallbackItems } from "./summary/model.ts";

/** Standalone owners assert adapter compatibility and supply Pi's flags. */
export type CardInterpretationInput = {
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

/** Card meaning, without transcript identities or run-summary work. */
export interface CardInterpretation {
  /** The selected display adapter, or generic for unsupported results and failed adapters. */
  readonly adapter: ToolDisplayAdapter;
  /** Argument streaming, queueing, or execution; not proof of execution. */
  readonly pending: boolean;
  /** Cancellation outranks failure; success and unavailable metadata override neither. */
  readonly outcome: Outcome;
  readonly mcp: McpFacts | undefined;
}

/** Transcript meaning. All fields use the same effective adapter. */
export interface CallInterpretation extends CardInterpretation {
  readonly action: DisplayAction | undefined;
  readonly exploration: readonly ExplorationItem[];
  /** Normalized against the interpretation cwd; undefined excludes the call from groups. */
  readonly group: GroupKey | undefined;
  /** Empty when the call is omitted from run summaries. */
  readonly summaryItems: readonly SummaryItem[];
  readonly summaryCategories: readonly SummaryCategory[];
}

export type DisplayFailure = {
  /** `adapter`: one of its callbacks threw. `renderer`: this package's card code threw. */
  readonly kind: "adapter" | "renderer";
  readonly adapter: ToolDisplayAdapter;
  readonly error: unknown;
};

/** Called once for each newly recorded failure. */
export type DisplayFailureHandler = (failure: DisplayFailure) => void;

/** Thrown by a guarded presentation callback after its failure is recorded. */
class AdapterFailed extends Error {
  constructor(readonly failure: DisplayFailure) {
    super(`display adapter ${failure.adapter.id} failed`, { cause: failure.error });
  }
}

/** Callbacks that cards read; interpretation callbacks run in `interpret`. */
const PRESENTATION_CALLBACKS = new Set<PropertyKey>([
  "invocation",
  "code",
  "headingVerbs",
  "summary",
  "textParts",
  "notices",
  "nestedCalls",
  "imageCaptionMimeType",
  "progress"
] satisfies (keyof ToolDisplayAdapter)[]);

/**
 * Evaluates one call's display adapter and holds its sticky failure. After the
 * selected display adapter fails, interpretation and cards of the call use the
 * generic display adapter while the call keeps that display adapter. The
 * transcript coordinator owns one for each bound call; a standalone card row
 * owns its own.
 */
export class AdapterEvaluator {
  private failed: ToolDisplayAdapter | undefined;

  constructor(
    private selected: () => ToolDisplayAdapter,
    private onFailure: DisplayFailureHandler | undefined,
    /** Runs after a card failure, which changes every display consumer of the call. */
    private onChange?: () => void
  ) {}

  /** The selected display adapter, or the generic one after it failed. */
  get adapter(): ToolDisplayAdapter {
    const selected = this.selected();

    return this.failed === selected ? genericAdapter : selected;
  }

  /**
   * Derives metadata atomically, so a failed callback cannot leave consumers
   * with a mix of specialized and generic facts. The derived value is already
   * generic after a failure, so no consumer needs a change.
   */
  interpret<Value>(derive: (adapter: ToolDisplayAdapter) => Value): Value {
    const adapter = this.adapter;

    try {
      return derive(adapter);
    } catch (error) {
      if (adapter === genericAdapter) throw error;
      this.record({ kind: "adapter", adapter, error });

      return derive(genericAdapter);
    }
  }

  /**
   * The display adapter that cards read. Fields are read only on access, and
   * each presentation callback runs through the same guard. The generic display
   * adapter is not guarded: its failures are renderer failures.
   */
  presentation(adapter: ToolDisplayAdapter): ToolDisplayAdapter {
    if (adapter === genericAdapter) return adapter;

    // A separate target permits guarded reads of frozen, non-configurable callbacks.
    return new Proxy(
      {
        get id() {
          return adapter.id;
        },
        get family() {
          return adapter.family;
        }
      },
      {
        get: (_target, key) => {
          const value: unknown = Reflect.get(adapter, key);
          if (!PRESENTATION_CALLBACKS.has(key) || typeof value !== "function") return value;

          return (...args: unknown[]): unknown => {
            try {
              const result: unknown = Reflect.apply(value, adapter, args);

              return result;
            } catch (error) {
              const failure = { kind: "adapter", adapter, error } as const;
              this.record(failure, true);
              throw new AdapterFailed(failure);
            }
          };
        }
      }
    );
  }

  /**
   * Runs card work. A card that fails runs once more, prepared again with the
   * generic display adapter, so no card mixes two display adapters. Presentation
   * callbacks record their own failure; any other error is a failure of this
   * package's card code for the `interpreted` display adapter. A failure of the
   * generic card propagates.
   */
  render<Value>(interpreted: () => ToolDisplayAdapter | undefined, work: () => Value): Value {
    try {
      return work();
    } catch (error) {
      if (!(error instanceof AdapterFailed)) {
        const adapter = interpreted();
        if (!adapter || adapter === genericAdapter) throw error;
        this.record({ kind: "renderer", adapter, error }, true);
      }

      return work();
    }
  }

  private record(failure: DisplayFailure, change = false): void {
    const { adapter } = failure;
    if (this.selected() !== adapter || this.failed === adapter) return;
    this.failed = adapter;

    try {
      this.onFailure?.(failure);
    } catch {
      /* Reporting must not break rendering. */
    }

    if (change) this.onChange?.();
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

function cardMeaning(
  adapter: ToolDisplayAdapter,
  args: unknown,
  result: BorrowedToolResult | undefined,
  pending: boolean,
  recorded: Outcome
): CardInterpretation {
  const mcp = adapter.mcp?.(args, result);
  const reported = result && !pending ? adapter.outcome?.(result) : undefined;
  const outcomes = [recorded, reported, pending ? undefined : mcp?.outcome];
  let outcome: Outcome = "success";
  if (outcomes.includes("cancelled")) outcome = "cancelled";
  else if (
    outcomes.some(
      (value) => value === "failure" || value === "transport-error" || value === "returned-error"
    )
  )
    outcome = "failure";
  else if (outcomes.includes("unavailable")) outcome = "unavailable";

  return { adapter, pending, outcome, mcp };
}

/** Ignore CLI-only callbacks, including their failures, for standalone cards. */
export function interpretCard(
  input: CardInterpretationInput,
  evaluator: AdapterEvaluator
): CardInterpretation {
  return evaluator.interpret((adapter) =>
    cardMeaning(
      adapter,
      input.args,
      input.result,
      input.pending,
      input.failed ? "failure" : "success"
    )
  );
}

/**
 * The coordinator caches this snapshot; card bodies remain lazy. `cwd` resolves
 * identities without reading files.
 */
export function interpret(
  call: DisplayCall,
  cwd: string,
  evaluator: AdapterEvaluator
): CallInterpretation {
  const owner = call.adapter;
  const { args, result, name } = call;
  const pending = PENDING.has(call.lifecycle);
  const recorded = isCancelled(call) ? "cancelled" : call.outcome;

  return evaluator.interpret((candidate): CallInterpretation => {
    const adapter =
      result && candidate.supports?.(args, result) === false ? genericAdapter : candidate;
    const meaning = cardMeaning(adapter, args, result, pending, recorded);
    const exploration = adapter.exploration?.(args, result) ?? [];

    return {
      action: adapter.action?.(args, result),
      ...meaning,
      exploration,
      group: groupKey(exploration, adapter.groupTitle, cwd),
      // The selected owner's policy applies even when its presentation falls back.
      summaryItems: owner.omitFromSummary
        ? []
        : (adapter.summaryItems?.(args, { result, change: call.change, cwd }) ??
          fallbackItems(adapter.family, name, call.change)),
      summaryCategories: adapter.summaryCategories ?? []
    };
  });
}
