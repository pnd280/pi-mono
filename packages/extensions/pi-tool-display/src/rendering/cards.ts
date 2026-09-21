import {
  getCapabilities,
  MouseRegion,
  truncateToWidth,
  type Component
} from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { genericAdapter, resolveResultAdapter } from "../adapters/generic.ts";
import { isLive, type BorrowedToolResult, type ToolDisplayAdapter } from "../contracts.ts";
import { heading } from "./headings.ts";
import { displayOutcome } from "./outcome.ts";
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

function prepareCard(base: Omit<Projection, "mcp" | "outcome" | "summary">): PreparedCard {
  const mcp = lazy(() => base.adapter.mcp?.(base.context.args, base.result));
  const outcome = lazy(() => displayOutcome({ ...base, mcp: mcp() }));
  const context = lazy(() => ({
    ...base.context,
    isError: outcome() === "failure" || outcome() === "cancelled"
  }));
  const invocation = lazy(() => base.adapter.invocation?.(base.context.args, base.result));
  const exploration = lazy(() => base.adapter.exploration?.(base.context.args, base.result) ?? []);
  const headingVerbs = lazy(() => base.adapter.headingVerbs?.(base.context.args));
  const summary = lazy(() => {
    if (!base.result || base.context.isPartial || outcome() === "unavailable") return undefined;
    const value = base.adapter.summary?.(base.result, {
      args: base.context.args,
      outcome: outcome(),
      operation: base.call?.operation,
      expanded: base.expanded
    });

    return value?.text.trim() ? value : undefined;
  });
  const body = lazy(() =>
    base.result ? buildResultBody(base.result, prepared) : { items: [], annotations: [] }
  );
  // Groups use the same result policy in the call slot at their nested width.
  // Keep preparation lazy so a hidden result slot does not format a second body.
  const groupRows = lazy(() =>
    buildGroupRows({
      ...base,
      width: base.width - 2,
      get context() {
        return context();
      },
      get outcome() {
        return outcome();
      },
      get mcp() {
        return mcp();
      },
      get summary() {
        return summary();
      }
    })
  );
  const prepared: PreparedCard = {
    ...base,
    get context() {
      return context();
    },
    get outcome() {
      return outcome();
    },
    get mcp() {
      return mcp();
    },
    get summary() {
      return summary();
    },
    get invocation() {
      return invocation();
    },
    get exploration() {
      return exploration();
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

/** A Pi row owns both slots, borrowed results, and all preparation/invalidation.
 * Slot renders check the transcript revision even when Pi reuses a component
 * without calling the renderer again (late adapters and observation updates).
 */
class CardRow {
  private callArgs: { value: unknown } | undefined;
  private result: BorrowedToolResult | undefined;
  private prepared:
    | {
        width: number;
        revision: number | undefined;
        headingPhase: number | undefined;
        animated: boolean;
        expanded: boolean;
        adapter: ToolDisplayAdapter;
        images: ReturnType<typeof getCapabilities>["images"];
        card: PreparedCard;
        rows: Partial<Record<Slot, string[]>>;
      }
    | undefined;

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

  render(slot: Slot, width: number): string[] {
    if (width < 1) return [];
    const { binding } = this.options;
    const call = binding?.call;
    const adapter = call?.adapter ?? this.adapter;
    const expanded = this.expanded;
    const revision = call?.revision;
    const images = getCapabilities().images;
    let current = this.prepared;

    if (
      !current ||
      current.width !== width ||
      current.revision !== revision ||
      current.expanded !== expanded ||
      current.adapter !== adapter ||
      current.images !== images
    ) {
      const card = this.prepare({ width, expanded });
      current = {
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
      this.prepared = current;
    }

    // Pi renders every row on an animation redraw. Only a live heading depends on
    // the clock; its body and every completed card keep their prepared data.
    const phase = current.animated ? (binding?.coordinator.phase ?? 1) : 0;

    if (slot === "call" && current.headingPhase !== phase) {
      delete current.rows.call;
      current.headingPhase = phase;
    }

    return (current.rows[slot] ??= (
      slot === "call" ? heading(current.card, phase) : resultRows(current.card)
    ).map((row) => truncateToWidth(row, width, "")));
  }

  private prepare(view: Pick<Projection, "width" | "expanded">): PreparedCard {
    const { binding } = this.options;
    const call = binding?.call;
    const selected = call
      ? resolveResultAdapter(call.adapter, call.args, call.result)
      : this.adapter;

    return prepareCard({
      ...view,
      name: this.name,
      adapter: selected,
      showParameters:
        selected.alwaysShowParameters === true || this.options.showParameters === true,
      // Pi can retain streamed args and the pre-message_end error flag.
      context: call
        ? {
            ...this.context,
            args: call.args,
            isPartial: call.lifecycle !== "complete" && call.lifecycle !== "unavailable",
            isError:
              call.lifecycle === "complete"
                ? call.outcome === "failure" || call.outcome === "cancelled"
                : this.context.isError
          }
        : this.context,
      theme: this.theme,
      call,
      result: call?.result ?? this.result,
      group: binding ? binding.coordinator.group(binding.call) : undefined
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

    const content = new CardSlot(row, slot);

    return binding
      ? new MouseRegion(content, (event) => {
          if (
            event.type !== "click" ||
            event.button !== "left" ||
            !binding.coordinator.group(binding.call)
          )
            return undefined;
          binding.coordinator.expand(binding.call, !binding.call.expanded);

          return { handled: true };
        })
      : content;
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
