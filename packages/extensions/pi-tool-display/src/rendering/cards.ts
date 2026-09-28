import {
  getCapabilities,
  MouseRegion,
  truncateToWidth,
  type Component
} from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { genericAdapter, resolveResultAdapter } from "../adapters/generic.ts";
import {
  isLive,
  type BorrowedToolResult,
  type SummaryRole,
  type ToolDisplayAdapter
} from "../contracts.ts";
import { buildRunSummary } from "../summary/model.ts";
import { heading } from "./headings.ts";
import { displayOutcome } from "./outcome.ts";
import { buildGroupRows, buildResultBody } from "./result-content.ts";
import { resultRows } from "./results.ts";
import { renderCollapseRow, renderRunSummary } from "./summary-line.ts";
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

/** Only the leader renders; images are never rendered in summary mode. */
function summaryRows(role: SummaryRole, card: PreparedCard): string[] {
  if (role.kind === "hidden") return [];

  return renderRunSummary(buildRunSummary(role.run.members, card.context.cwd), {
    width: card.width,
    theme: card.theme
  });
}

function hasAnimatedHeading(card: PreparedCard, role: SummaryRole | undefined): boolean {
  // Summarized runs have ended; nothing in them animates.
  if (role) return false;
  if (card.group && !card.expanded)
    return card.group.members[0] === card.call && card.group.members.some(isLive);

  return card.call ? isLive(card.call) : card.context.isPartial;
}

/** Which ends of an opened, ended run carry this card's collapse controls. */
type CollapsePosition = "first" | "last" | "both";

type PreparedRow = {
  width: number;
  revision: number | undefined;
  headingPhase: number | undefined;
  animated: boolean;
  expanded: boolean;
  /** Summary role, collapse-control position, or neither. */
  role: SummaryRole["kind"] | CollapsePosition | undefined;
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

  private collapsePosition(): CollapsePosition | undefined {
    const { binding } = this.options;
    const run = binding && binding.coordinator.run(binding.call);
    if (!run) return;
    const first = run.members[0] === binding.call;
    const last = run.members.at(-1) === binding.call;
    if ((!first && !last) || !binding.coordinator.collapsible(binding.call)) return;

    if (first && last) return "both";

    return first ? "first" : "last";
  }

  private get footerSlot(): Slot {
    // Pi does not create a result slot for historical calls with no retained result.
    return this.result === undefined ? "call" : "result";
  }

  collapseAt(slot: Slot, y: number, height: number): boolean {
    const position = this.collapsePosition();

    return (
      ((position === "first" || position === "both") && slot === "call" && (y === 0 || y === 1)) ||
      ((position === "last" || position === "both") &&
        slot === this.footerSlot &&
        height >= 2 &&
        (y === height - 1 || y === height - 2))
    );
  }

  private preparedFor(width: number, summary: SummaryRole | undefined): PreparedRow {
    const call = this.options.binding?.call;
    const adapter = call?.adapter ?? this.adapter;
    const expanded = this.expanded;
    const revision = call?.revision;
    const images = getCapabilities().images;
    const role = summary?.kind ?? this.collapsePosition();
    const current = this.prepared;

    if (
      current?.width === width &&
      current.revision === revision &&
      current.expanded === expanded &&
      current.role === role &&
      current.adapter === adapter &&
      current.images === images
    )
      return current;

    // Summary cards are compact and standalone, never group members.
    const card = this.prepare({ width, expanded: summary ? false : expanded }, !summary);
    this.prepared = {
      width,
      revision,
      headingPhase: undefined,
      animated: hasAnimatedHeading(card, summary),
      expanded,
      role,
      adapter,
      images,
      card,
      rows: {}
    };

    return this.prepared;
  }

  render(slot: Slot, width: number): string[] {
    if (width < 1) return [];
    const { binding } = this.options;
    const summary = binding ? binding.coordinator.summaryRole(binding.call) : undefined;
    const current = this.preparedFor(width, summary);

    // Pi renders every row on an animation redraw. Only a live heading depends on
    // the clock; its body and every completed card keep their prepared data.
    const phase = current.animated ? (binding?.coordinator.phase ?? 1) : 0;

    if (slot === "call" && current.headingPhase !== phase) {
      delete current.rows.call;
      current.headingPhase = phase;
    }

    if (current.rows[slot]) return current.rows[slot];
    const card = current.card;
    let rows: string[];

    if (summary) rows = slot === "call" ? summaryRows(summary, card) : [];
    else {
      rows = slot === "call" ? heading(card, phase) : resultRows(card);
      const first = current.role === "first" || current.role === "both";
      const last = current.role === "last" || current.role === "both";
      if (first && slot === "call")
        rows = [renderCollapseRow({ width, theme: card.theme }), "", ...rows];
      if (last && slot === this.footerSlot)
        rows = [...rows, "", renderCollapseRow({ width, theme: card.theme })];
    }

    return (current.rows[slot] = rows.map((row) => truncateToWidth(row, width, "")));
  }

  private prepare(view: Pick<Projection, "width" | "expanded">, grouped = true): PreparedCard {
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
      group: binding && grouped ? binding.coordinator.group(binding.call) : undefined
    });
  }
}

class CardSlot implements Component {
  private height = 0;
  constructor(
    private row: CardRow,
    private slot: Slot
  ) {}

  update(row: CardRow, slot: Slot): void {
    this.row = row;
    this.slot = slot;
  }

  render(width: number): string[] {
    const rows = this.row.render(this.slot, width);
    this.height = rows.length;

    return rows;
  }

  collapseAt(y: number): boolean {
    return this.row.collapseAt(this.slot, y, this.height);
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
          if (event.type !== "click" || event.button !== "left") return undefined;

          if (content.collapseAt(event.y)) {
            binding.coordinator.closeRun(binding.call);

            return { handled: true };
          }

          const summarized = !!binding.coordinator.summaryRole(binding.call);
          // Any click on a card also keeps its unended run open once it ends.
          binding.coordinator.openRun(binding.call);
          if (summarized) return { handled: true };

          if (!binding.coordinator.group(binding.call)) return undefined;
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
