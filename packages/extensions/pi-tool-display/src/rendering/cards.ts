import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  MouseRegion,
  truncateToWidth,
  type Component
} from "@earendil-works/pi-tui";

import { genericAdapter, resolveResultAdapter } from "../adapters/generic.ts";
import type { ToolDisplayAdapter } from "../contracts.ts";
import { displayText } from "../terminal-text.ts";
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

function prepareCard(base: Omit<Projection, "mcp">): PreparedCard {
  const mcp = lazy(() => base.adapter.mcp?.(base.context.args, base.result));
  const invocation = lazy(() => base.adapter.invocation?.(base.context.args, base.result));
  const exploration = lazy(() => base.adapter.exploration?.(base.context.args, base.result) ?? []);
  const headingVerbs = lazy(() => base.adapter.headingVerbs?.(base.context.args));
  const body = lazy(() =>
    base.result ? buildResultBody(base.result, prepared) : { items: [], annotations: [] }
  );
  // Compact groups own their diagnostics in the call slot at the nested width.
  // Never prepare the successful text body just to decide which slot is visible.
  const groupRows = lazy(() =>
    buildGroupRows({
      ...base,
      width: base.width - 2,
      get mcp() {
        return mcp();
      }
    })
  );
  const prepared: PreparedCard = {
    ...base,
    get mcp() {
      return mcp();
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

/** A Pi row owns both slots, borrowed results, and all preparation/invalidation.
 * Slot renders check the transcript revision even when Pi reuses a component
 * without calling the renderer again (late adapters and observation updates).
 */
class CardRow {
  private callArgs: { value: unknown } | undefined;
  private result: AgentToolResult<unknown> | undefined;
  private prepared:
    | {
        width: number;
        revision: number | undefined;
        phase: number;
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
    result?: AgentToolResult<unknown>
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

  render(slot: Slot, width: number): string[] {
    if (width < 1) return [];
    const { binding } = this.options;
    const call = binding?.call;
    const adapter = call?.adapter ?? this.adapter;
    const phase = binding?.coordinator.phase ?? 1;
    const expanded = binding?.coordinator.calls.has(binding.call.key)
      ? binding.call.expanded
      : this.context.expanded;
    const revision = call?.revision;
    const images = getCapabilities().images;
    let current = this.prepared;

    if (
      !current ||
      current.width !== width ||
      current.revision !== revision ||
      current.phase !== phase ||
      current.expanded !== expanded ||
      current.adapter !== adapter ||
      current.images !== images
    ) {
      const card = this.prepare({ width, expanded, phase });
      current = { width, revision, phase, expanded, adapter, images, card, rows: {} };
      this.prepared = current;
    }

    return (current.rows[slot] ??= (
      slot === "call" ? heading(current.card) : resultRows(current.card)
    ).map((row) => truncateToWidth(row, width, "")));
  }

  private prepare(view: Pick<Projection, "width" | "expanded" | "phase">): PreparedCard {
    const { binding } = this.options;
    const call = binding?.call;
    const selected = call
      ? resolveResultAdapter(call.adapter, call.args, call.result)
      : this.adapter;

    return prepareCard({
      ...view,
      name: this.name,
      adapter: selected,
      showParameters: selected.id === "generic" || this.options.showParameters === true,
      // Pi can retain streamed args and the pre-message_end error flag.
      context: call
        ? {
            ...this.context,
            args: call.args,
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

/** Internal card factory; api.ts exposes the standalone owner surface. */
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
    result?: AgentToolResult<unknown>
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
