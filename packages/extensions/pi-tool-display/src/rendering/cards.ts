import { genericAdapter, resolveResultAdapter } from "../adapters/generic.ts";
import type { ToolDisplayAdapter } from "../contracts.ts";
import { displayText } from "../terminal-text.ts";
import { component } from "./components.ts";
import { heading } from "./headings.ts";
import { resultRows } from "./results.ts";
import type {
  CardRendererOptions,
  ToolDisplayRenderers,
  DisplayContext,
  DisplayTheme,
  RowState,
  Projection
} from "./types.ts";

/** Internal card factory; api.ts exposes the standalone owner surface. */
export function createToolDisplayRenderers(
  name: string,
  adapter: ToolDisplayAdapter = genericAdapter,
  options: CardRendererOptions = {}
): ToolDisplayRenderers {
  const { binding } = options;
  // Pi calls the header slot before the result slot, then renders both components.
  // Key retained results by Pi's row-local state so owner factories can serve many rows.
  const states = new WeakMap<object, RowState>();

  const rowState = (context: DisplayContext): RowState => {
    if (context.state === null || typeof context.state !== "object") return {};
    let row = states.get(context.state);

    if (!row) {
      row = {};
      states.set(context.state, row);
    }

    return row;
  };

  const projection = (context: DisplayContext, theme: DisplayTheme, width: number): Projection => {
    const selected = binding?.call.adapter ?? adapter;
    const current = binding
      ? resolveResultAdapter(selected, binding.call.args, binding.call.result)
      : selected;

    return {
      name: displayText(name),
      adapter: current,
      showParameters: current.id === "generic" || options.showParameters === true,
      // Pi's row can retain streamed arguments and the pre-message_end error flag.
      context: binding
        ? {
            ...context,
            args: binding.call.args,
            isError:
              binding.call.lifecycle === "complete"
                ? binding.call.outcome === "failure" || binding.call.outcome === "cancelled"
                : context.isError
          }
        : context,
      theme,
      width,
      expanded: binding?.coordinator.calls.has(binding.call.key)
        ? binding.call.expanded
        : context.expanded,
      call: binding?.call,
      result: binding?.call.result ?? rowState(context).result,
      group: binding ? binding.coordinator.group(binding.call) : undefined,
      phase: binding?.coordinator.phase ?? 1,
      row: rowState(context)
    };
  };

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const row = rowState(context);
      row.body = undefined;

      return component(
        context,
        (width) => heading(projection({ ...context, args }, theme, width)),
        () => {
          row.body = undefined;
        },
        binding
      );
    },
    renderResult(result, options, theme, context) {
      const row = rowState(context);
      row.result = result;
      row.body = undefined;

      return component(
        context,
        (width) => resultRows(result, projection({ ...context, ...options }, theme, width)),
        () => {
          row.body = undefined;
        },
        binding
      );
    }
  };
}
