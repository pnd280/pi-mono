import type { ExtensionCommandContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { browserLayout } from "@pi-mono/libs/tui/components/browser";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";

import {
  ERR_COLLAPSE_REQUIRES_FULLSCREEN,
  ERR_REQUIRES_INTERACTIVE,
  ERR_TODOS_USAGE
} from "./constants.ts";
import type { TodoController } from "./controller.ts";
import { formatTodosCommandOutput } from "./format.ts";
import type { TodoWidget } from "./todo-widget.ts";
import { TodosView } from "./todos-view.ts";

const actions = ["collapse", "expand", "toggle"] as const;

export function getTodosArgumentCompletions(prefix: string) {
  const normalized = prefix.trimStart().toLowerCase();
  const matches = actions
    .filter((action) => action.startsWith(normalized))
    .map((value) => ({
      value,
      label: value,
      description: `${value} the above-editor todo widget`
    }));

  return matches.length ? matches : null;
}

/** Pi routes forced Tab to file completion; only /todos arguments opt out. */
export function todosArgumentAutocompleteProvider(
  current: AutocompleteProvider
): AutocompleteProvider {
  const owns = (lines: string[], line: number, col: number) =>
    (lines[line] ?? "").slice(0, col).trimStart().startsWith("/todos ");

  return {
    ...(current.triggerCharacters === undefined
      ? {}
      : { triggerCharacters: current.triggerCharacters }),
    getSuggestions: (lines, line, col, options) =>
      current.getSuggestions(
        lines,
        line,
        col,
        options.force && owns(lines, line, col) ? { ...options, force: false } : options
      ),
    applyCompletion: (lines, line, col, item, prefix) =>
      current.applyCompletion(lines, line, col, item, prefix),
    shouldTriggerFileCompletion: (lines, line, col) =>
      owns(lines, line, col) || (current.shouldTriggerFileCompletion?.(lines, line, col) ?? true)
  };
}

export class TodosCustomViewHost {
  private session = new AbortController();
  constructor(private readonly widget: Pick<TodoWidget, "suppress">) {}
  start(): void {
    this.shutdown();
    this.session = new AbortController();
  }
  shutdown(): void {
    this.session.abort();
  }

  async show(
    ctx: Pick<ExtensionCommandContext, "signal"> & {
      ui: Pick<ExtensionUIContext, "custom" | "notify">;
    },
    controller: Pick<TodoController, "getTodos">
  ): Promise<void> {
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, this.session.signal])
      : this.session.signal;
    if (signal.aborted) return;
    const suppression = this.widget.suppress();

    try {
      await openResponsiveCustomUI({
        ui: ctx.ui,
        signal,
        onInputRoutingUnavailable: () =>
          ctx.ui.notify(
            "Todo fullscreen paging is unavailable on this host. Use arrow keys to navigate.",
            "warning"
          ),
        useOverlay: (tui) => tui.mode !== "fullscreen" && browserLayout(tui.terminal.rows).overlay,
        overlayOptions: { width: "100%", anchor: "center" },
        create: (tui, theme, keybindings, done) =>
          new TodosView({ tasks: controller.getTodos(), tui, theme, keybindings, done })
      });
    } finally {
      suppression.release();
    }
  }
}

export async function runTodosCommand(
  args: string,
  ctx: Pick<ExtensionCommandContext, "mode" | "hasUI" | "signal"> & {
    ui: Pick<ExtensionUIContext, "custom" | "notify">;
  },
  controller: Pick<TodoController, "getTodos">,
  options: {
    customViewHost: TodosCustomViewHost;
    widgetStateHost: Pick<TodoWidget, "canCollapse" | "toggleCollapsed" | "setCollapsed">;
    writeOutput?: (text: string) => void;
  }
): Promise<void> {
  const notify = (text: string, type: "info" | "error" = "info") => {
    if (ctx.hasUI) ctx.ui.notify(text, type);
    else (options.writeOutput ?? console.log)(text);
  };

  const command = args.trim();
  if (command === "collapse" || command === "expand" || command === "toggle") {
    if (ctx.mode !== "tui") {
      notify(ERR_REQUIRES_INTERACTIVE, "error");

      return;
    }

    if (!options.widgetStateHost.canCollapse()) {
      notify(ERR_COLLAPSE_REQUIRES_FULLSCREEN, "error");

      return;
    }

    const collapsed =
      command === "toggle"
        ? options.widgetStateHost.toggleCollapsed()
        : options.widgetStateHost.setCollapsed(command === "collapse");
    notify(collapsed ? "Todo widget collapsed" : "Todo widget expanded");
  } else if (command) notify(ERR_TODOS_USAGE, "error");
  else if (ctx.mode === "tui") await options.customViewHost.show(ctx, controller);
  else
    notify(
      ctx.hasUI ? formatTodosCommandOutput(controller.getTodos()) : ERR_REQUIRES_INTERACTIVE,
      ctx.hasUI ? "info" : "error"
    );
}
