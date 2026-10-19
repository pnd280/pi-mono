import type { ExtensionCommandContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { browserLayout } from "@pi-mono/libs/tui/components/browser/layout";

import type { TodoController } from "./state/controller.ts";
import type { TodoWidget } from "./ui/todo-widget.ts";

const ERR_COLLAPSE_REQUIRES_FULLSCREEN =
  "Todo widget collapse is only available in fullscreen mode";

const ERR_TODOS_USAGE = "Usage: /todos [collapse|expand|toggle]";

// The browser view and its shared TUI components load on first use, not at startup.
// Concurrent opens share one import: under jiti a concurrent import can return a partly evaluated module.
const importBrowserModules = () =>
  Promise.all([import("@pi-mono/libs/tui/responsive-custom-ui"), import("./ui/todos-view.ts")]);
let browserModules: ReturnType<typeof importBrowserModules> | undefined;
const loadBrowserModules = () => (browserModules ??= importBrowserModules());

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
    // Read the host context before the view loads; the invocation can end during the import.
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, this.session.signal])
      : this.session.signal;
    const ui = ctx.ui;
    const [{ openResponsiveCustomUI }, { TodosView }] = await loadBrowserModules();
    if (signal.aborted) return;
    const suppression = this.widget.suppress();

    try {
      await openResponsiveCustomUI({
        ui,
        signal,
        onInputRoutingUnavailable: () =>
          ui.notify(
            "Todo fullscreen input routing is unavailable on this host. Use regular mode if controls do not respond.",
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
  ctx: Pick<ExtensionCommandContext, "signal"> & {
    ui: Pick<ExtensionUIContext, "custom" | "notify">;
  },
  controller: Pick<TodoController, "getTodos">,
  options: {
    customViewHost: TodosCustomViewHost;
    widgetStateHost: Pick<TodoWidget, "canCollapse" | "toggleCollapsed" | "setCollapsed">;
  }
): Promise<void> {
  const command = args.trim();
  if (command === "collapse" || command === "expand" || command === "toggle") {
    if (!options.widgetStateHost.canCollapse()) {
      ctx.ui.notify(ERR_COLLAPSE_REQUIRES_FULLSCREEN, "error");

      return;
    }

    const collapsed =
      command === "toggle"
        ? options.widgetStateHost.toggleCollapsed()
        : options.widgetStateHost.setCollapsed(command === "collapse");
    ctx.ui.notify(collapsed ? "Todo widget collapsed" : "Todo widget expanded");
  } else if (command) ctx.ui.notify(ERR_TODOS_USAGE, "error");
  else await options.customViewHost.show(ctx, controller);
}
