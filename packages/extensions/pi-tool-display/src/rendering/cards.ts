import { getCapabilities, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { genericAdapter } from "../adapters/generic.ts";
import {
  isLive,
  type BorrowedToolResult,
  type DisplayCall,
  type ToolDisplayAdapter
} from "../contracts.ts";
import { interpret, reportAdapterFailure, type CallInterpretation } from "../interpretation.ts";
import { heading } from "./headings.ts";
import { buildGroupRows, buildResultBody } from "./result-content.ts";
import { resultRows } from "./results.ts";
import type {
  CardRendererOptions,
  ToolDisplayRenderers,
  DisplayContext,
  DisplayTheme,
  PreparedCard,
  Projection
} from "./types.ts";

type Slot = "call" | "result";

function lazy<T>(prepare: () => T): () => T {
  let cached: { value: T } | undefined;

  return () => (cached ??= { value: prepare() }).value;
}

function prepareCard(
  interpretation: CallInterpretation,
  base: Omit<Projection, "adapter" | "mcp" | "outcome" | "summary">
): PreparedCard {
  const context = lazy(() => ({
    ...base.context,
    isPartial: interpretation.pending,
    isError: interpretation.outcome === "failure" || interpretation.outcome === "cancelled"
  }));
  const adapter = interpretation.adapter;
  const invocation = lazy(() => adapter.invocation?.(base.context.args, base.result));
  const headingVerbs = lazy(() => adapter.headingVerbs?.(base.context.args));
  const summary = lazy(() => {
    if (!base.result || interpretation.pending || interpretation.outcome === "unavailable")
      return undefined;
    const value = adapter.summary?.(base.result, {
      args: base.context.args,
      outcome: interpretation.outcome,
      operation: base.call?.operation,
      expanded: base.expanded
    });

    return value && displayText(value.text).trim() ? value : undefined;
  });
  const body = lazy(() =>
    base.result ? buildResultBody(base.result, prepared) : { items: [], annotations: [] }
  );
  // Groups use the same result policy in the call slot at their nested width.
  // Keep preparation lazy so a hidden result slot does not format a second body.
  const groupRows = lazy(() =>
    buildGroupRows({
      ...base,
      adapter,
      width: base.width - 2,
      get context() {
        return context();
      },
      get outcome() {
        return interpretation.outcome;
      },
      get mcp() {
        return interpretation.mcp;
      },
      get summary() {
        return summary();
      }
    })
  );
  const prepared: PreparedCard = {
    ...base,
    adapter,
    get context() {
      return context();
    },
    get outcome() {
      return interpretation.outcome;
    },
    get mcp() {
      return interpretation.mcp;
    },
    get summary() {
      return summary();
    },
    get invocation() {
      return invocation();
    },
    get exploration() {
      return interpretation.exploration;
    },
    get headingVerbs() {
      return headingVerbs();
    },
    get body() {
      return body();
    },
    get hasBody() {
      return body().items.some((item) => item.rows.length > 0);
    },
    get groupRows() {
      return groupRows();
    }
  };

  return prepared;
}

function hasAnimatedHeading(card: PreparedCard): boolean {
  if (card.group && !card.expanded)
    return card.group.members[0] === card.call && card.group.members.some(isLive);

  return card.call ? isLive(card.call) : card.context.isPartial;
}

type PreparedRow = {
  width: number;
  revision: number | undefined;
  headingPhase: number | undefined;
  animated: boolean;
  expanded: boolean;
  adapter: ToolDisplayAdapter;
  images: ReturnType<typeof getCapabilities>["images"];
  card: PreparedCard;
  rows: Partial<Record<Slot, string[]>>;
};

/** A Pi row owns both slots, borrowed results, and all preparation/invalidation.
 * Slot renders check the transcript revision even when Pi reuses a component
 * without calling the renderer again (late adapters and observation updates).
 */
class CardRow {
  private callArgs: { value: unknown } | undefined;
  private result: BorrowedToolResult | undefined;
  private prepared: PreparedRow | undefined;
  /** Standalone failure state; bound calls delegate fallback to the coordinator. */
  private fallback = false;

  constructor(
    private name: string,
    private adapter: ToolDisplayAdapter,
    private options: CardRendererOptions,
    private context: DisplayContext,
    private theme: DisplayTheme
  ) {}

  update(
    slot: Slot,
    context: DisplayContext,
    theme: DisplayTheme,
    result?: BorrowedToolResult
  ): void {
    // Standalone owners can pass call arguments separately from the result context.
    // Keep that authoritative reference; result-only rows use their current context.
    if (slot === "call") this.callArgs = { value: context.args };
    this.context = this.callArgs ? { ...context, args: this.callArgs.value } : context;
    this.theme = theme;
    if (result !== undefined) this.result = result;
    this.invalidate();
  }

  invalidate(): void {
    this.prepared = undefined;
  }

  private get expanded(): boolean {
    const { binding } = this.options;

    return binding?.coordinator.calls.has(binding.call.key)
      ? binding.call.expanded
      : this.context.expanded;
  }

  private preparedFor(width: number): PreparedRow {
    const call = this.options.binding?.call;
    const adapter = this.fallback ? genericAdapter : (call?.adapter ?? this.adapter);
    const expanded = this.expanded;
    const revision = call?.revision;
    const images = getCapabilities().images;
    const current = this.prepared;

    if (
      current?.width === width &&
      current.revision === revision &&
      current.expanded === expanded &&
      current.adapter === adapter &&
      current.images === images
    )
      return current;

    const interpretation = this.interpretation();
    const card = this.prepare(interpretation, { width, expanded });
    this.prepared = {
      width,
      revision,
      headingPhase: undefined,
      animated: hasAnimatedHeading(card),
      expanded,
      adapter,
      images,
      card,
      rows: {}
    };

    return this.prepared;
  }

  /** A throwing adapter callback renders the row with the generic adapter instead. */
  render(slot: Slot, width: number): string[] {
    try {
      return this.renderSlot(slot, width);
    } catch (error) {
      const adapter = this.prepared?.card.adapter;
      if (this.fallback || !adapter || adapter === genericAdapter) throw error;
      const { binding, onAdapterFailure } = this.options;

      if (binding) binding.coordinator.failAdapter(binding.call, adapter, error);
      else {
        this.fallback = true;
        reportAdapterFailure(onAdapterFailure, adapter, error);
      }

      this.invalidate();

      return this.renderSlot(slot, width);
    }
  }

  private renderSlot(slot: Slot, width: number): string[] {
    if (width < 1) return [];
    const { binding } = this.options;
    const current = this.preparedFor(width);

    // Pi renders every row on an animation redraw. Only a live heading depends on
    // the clock; its body and every completed card keep their prepared data.
    const phase = current.animated ? (binding?.coordinator.phase ?? 0) : 0;

    if (slot === "call" && current.headingPhase !== phase) {
      delete current.rows.call;
      current.headingPhase = phase;
    }

    if (current.rows[slot]) return current.rows[slot];
    const card = current.card;

    const rows = slot === "call" ? heading(card, phase) : resultRows(card);

    return (current.rows[slot] = rows.map((row) => truncateToWidth(row, width, "")));
  }

  private interpretation(): CallInterpretation {
    const { binding, onAdapterFailure } = this.options;
    if (binding) return binding.coordinator.interpretation(binding.call);

    // Standalone renders have no transcript identities; Pi's context cwd only displays paths.
    return interpret(
      {
        name: this.name,
        adapter: this.fallback ? genericAdapter : this.adapter,
        args: this.context.args,
        result: this.result,
        pending: this.context.isPartial,
        failed: this.context.isError
      },
      this.context.cwd,
      onAdapterFailure
    );
  }

  private prepare(
    interpretation: CallInterpretation,
    view: Pick<Projection, "width" | "expanded">
  ): PreparedCard {
    const { binding } = this.options;
    const call = binding?.call;
    const selected = interpretation.adapter;
    const interpretCall = (member: DisplayCall) =>
      binding
        ? binding.coordinator.interpretation(member)
        : interpret({ call: member }, this.context.cwd);

    return prepareCard(interpretation, {
      ...view,
      name: this.name,
      showParameters:
        selected.alwaysShowParameters === true || this.options.showParameters === true,
      // Pi can retain streamed args and the pre-message_end error flag.
      context: call ? { ...this.context, args: call.args } : this.context,
      theme: this.theme,
      call,
      result: call?.result ?? this.result,
      group: binding ? binding.coordinator.group(binding.call) : undefined,
      interpret: interpretCall
    });
  }
}

class CardSlot implements Component {
  constructor(
    private row: CardRow,
    private slot: Slot
  ) {}

  update(row: CardRow, slot: Slot): void {
    this.row = row;
    this.slot = slot;
  }

  render(width: number): string[] {
    return this.row.render(this.slot, width);
  }

  invalidate(): void {
    this.row.invalidate();
  }
}

/** Internal card factory. Tool authors use the public factory in api.ts. */
export function createToolDisplayRenderers(
  name: string,
  adapter: ToolDisplayAdapter = genericAdapter,
  options: CardRendererOptions = {}
): ToolDisplayRenderers {
  const { binding } = options;
  const states = new WeakMap<object, CardRow>();
  const title = displayText(name);

  const component = (
    slot: Slot,
    context: DisplayContext,
    theme: DisplayTheme,
    result?: BorrowedToolResult
  ): Component => {
    const state = context.state;
    const key = state !== null && typeof state === "object" ? state : undefined;
    let row = key ? states.get(key) : undefined;

    if (!row) {
      row = new CardRow(title, adapter, options, context, theme);
      if (key) states.set(key, row);
    }

    row.update(slot, context, theme, result);

    if (!binding && context.lastComponent instanceof CardSlot) {
      context.lastComponent.update(row, slot);

      return context.lastComponent;
    }

    return new CardSlot(row, slot);
  };

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      return component("call", { ...context, args }, theme);
    },
    renderResult(result, options, theme, context) {
      return component(
        "result",
        {
          ...context,
          expanded: options.expanded,
          isPartial: options.isPartial
        },
        theme,
        result
      );
    }
  };
}
