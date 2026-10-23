import { getCapabilities, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { genericAdapter } from "../adapters/generic.ts";
import { isLive, type BorrowedToolResult, type ToolDisplayAdapter } from "../contracts.ts";
import { AdapterEvaluator, interpretCard, type CardInterpretation } from "../interpretation.ts";
import { heading } from "./headings.ts";
import { progressHeading } from "./progress.ts";
import { PreparedResult } from "./result-content.ts";
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
  interpretation: CardInterpretation,
  base: Omit<Projection, "adapter" | "mcp" | "outcome" | "summary">,
  evaluator: AdapterEvaluator
): PreparedCard {
  const context = lazy(() => ({
    ...base.context,
    isPartial: interpretation.pending,
    isError: interpretation.outcome === "failure" || interpretation.outcome === "cancelled"
  }));
  const adapter = evaluator.presentation(interpretation.adapter);
  const invocation = lazy(() => adapter.invocation?.(base.context.args, base.result));
  const code = lazy(() => adapter.code?.(base.context.args));
  const headingVerbs = lazy(() => adapter.headingVerbs?.(base.context.args));
  const progress = lazy(() => adapter.progress?.(base.context.args, base.result));
  const summary = lazy(() => {
    if (!base.result || interpretation.pending || interpretation.outcome === "unavailable")
      return undefined;
    const value = adapter.summary?.(base.result, {
      args: base.context.args,
      outcome: interpretation.outcome,
      operation: base.call?.operation,
      // Standalone cards have no transcript call; Pi's context holds the same measurement.
      durationMs: base.call ? base.call.durationMs : base.context.durationMs,
      expanded: base.expanded
    });

    return value && displayText(value.text).trim() ? value : undefined;
  });
  const preparedResult = lazy(() => new PreparedResult(prepared));
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
    get code() {
      return code();
    },
    get headingVerbs() {
      return headingVerbs();
    },
    get progress() {
      return progress();
    },
    get preparedResult() {
      return preparedResult();
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
  animatedRows?: [string[], string[]];
  /** Whether elapsed time has changed the progress heading rows. */
  progressStale?: () => boolean;
  animated: boolean;
  expanded: boolean;
  adapter: ToolDisplayAdapter;
  /** The interpreted adapter, before its presentation guard. */
  interpreted: ToolDisplayAdapter;
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
  /** Bound calls use the coordinator's evaluator instead. */
  private standalone: AdapterEvaluator | undefined;

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

  private get evaluator(): AdapterEvaluator {
    const { binding, onFailure } = this.options;
    if (binding) return binding.coordinator.evaluator(binding.call);

    return (this.standalone ??= new AdapterEvaluator(() => this.adapter, onFailure));
  }

  private get expanded(): boolean {
    const { binding } = this.options;

    return binding?.coordinator.calls.has(binding.call.key)
      ? binding.call.expanded
      : this.context.expanded;
  }

  private preparedFor(width: number): PreparedRow {
    const call = this.options.binding?.call;
    const adapter = this.evaluator.adapter;
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
      animated: hasAnimatedHeading(card),
      expanded,
      adapter,
      interpreted: interpretation.adapter,
      images,
      card,
      rows: {}
    };

    return this.prepared;
  }

  /**
   * A recorded failure changes the effective display adapter, so the retry prepares
   * again. Pi renders the call slot first; preparing a visible result slot with it lets
   * a result failure make the heading generic before Pi receives it.
   */
  render(slot: Slot, width: number): string[] {
    return this.evaluator.render(
      () => this.prepared?.interpreted,
      () => {
        if (slot === "call" && this.result !== undefined) this.renderSlot("result", width);

        return this.renderSlot(slot, width);
      }
    );
  }

  private renderSlot(slot: Slot, width: number): string[] {
    if (width < 1) return [];
    const { binding } = this.options;
    const current = this.preparedFor(width);

    // Pi renders every row on an animation redraw. Only a live heading depends on
    // the clock; its body and every completed card keep their prepared data.
    const phase = current.animated ? (binding?.coordinator.phase ?? 0) : 0;

    if (current.animated && current.progressStale?.()) {
      delete current.rows.call;
      delete current.animatedRows;
    }

    const rows = (current.rows[slot] ??= this.slotRows(slot, current).map((row) =>
      truncateToWidth(row, width, "")
    ));
    if (slot !== "call" || !current.animated) return rows;

    // Keep the marker visible in both phases without changing the heading or its layout.
    const marker = current.expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
    const tint = (color: "muted" | "dim") =>
      rows.map((row, index) =>
        index === 0 ? row.replace(marker, this.theme.fg(color, marker)) : row
      );
    current.animatedRows ??= [tint("muted"), tint("dim")];

    return current.animatedRows[phase ? 1 : 0];
  }

  private interpretation(): CardInterpretation {
    const { binding } = this.options;
    if (binding) return binding.coordinator.interpretation(binding.call);

    return interpretCard(
      {
        args: this.context.args,
        result: this.result,
        pending: this.context.isPartial,
        failed: this.context.isError
      },
      this.evaluator
    );
  }

  private slotRows(slot: Slot, current: PreparedRow): string[] {
    const { card } = current;
    const progress = card.progress;

    if (progress) {
      if (slot === "call") {
        const heading = progressHeading(progress, card);
        current.progressStale = heading.stale;

        return heading.rows;
      }

      if (!card.expanded)
        return progress.resultPreview ? card.preparedResult.progressPreview() : [];
    }

    return slot === "call" ? heading(card) : card.preparedResult.rows();
  }

  private prepare(
    interpretation: CardInterpretation,
    view: Pick<Projection, "width" | "expanded">
  ): PreparedCard {
    const { binding } = this.options;
    const call = binding?.call;
    const selected = interpretation.adapter;
    const group = binding?.coordinator.group(binding.call);

    return prepareCard(
      interpretation,
      {
        ...view,
        // Final-message middleware can rename a bound call; follow the final tool.
        name: call ? displayText(call.name) : this.name,
        showParameters:
          selected.alwaysShowParameters === true || this.options.showParameters === true,
        // Pi can retain streamed args and the pre-message_end error flag.
        context: call ? { ...this.context, args: call.args } : this.context,
        theme: this.theme,
        call,
        result: call?.result ?? this.result,
        group:
          group && binding
            ? {
                ...group,
                exploration: binding.coordinator.interpretation(binding.call).exploration,
                interpret: (member) => binding.coordinator.interpretation(member)
              }
            : undefined
      },
      this.evaluator
    );
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
