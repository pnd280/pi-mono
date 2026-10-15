import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { WidgetCoordinator } from "./coordinator.ts";
import { findWidgetHost } from "./host.ts";
import { widgetSettings, type Preferences } from "./settings.ts";

// The menu loads on first use to keep it out of startup. Sessions share one import: under jiti
// a concurrent import can return a partly evaluated module.
const importMenu = () =>
  Promise.all([import("@pi-mono/libs/tui/responsive-custom-ui"), import("./menu/widget-menu.ts")]);
let menu: ReturnType<typeof importMenu> | undefined;
const loadMenu = () => (menu ??= importMenu());

export default function editorWidgets(pi: ExtensionAPI): void {
  let binding: ReturnType<typeof findWidgetHost>;
  let coordinator: WidgetCoordinator | undefined;
  let lifetime = new AbortController();
  let menuOpen = false;

  const notify = (ctx: ExtensionContext, message: string) => ctx.ui.notify(message, "warning");
  const settingsFor = (ctx: ExtensionContext) =>
    widgetSettings({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });

  const apply = (ctx: ExtensionContext, preferences: Preferences) => {
    for (const warning of preferences.warnings) notify(ctx, warning);
    coordinator?.apply(preferences.project ?? preferences.global);
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    lifetime.abort();
    lifetime = new AbortController();
    coordinator?.dispose();
    coordinator = undefined;

    try {
      binding = findWidgetHost(ctx.ui);
      if (!binding)
        throw new Error(
          "pi-editor-widgets: unsupported Pi widget registry. Use Pi 1.2.0 and /reload, or disable the extension. Native UI was left unchanged."
        );
      coordinator = new WidgetCoordinator(binding.host, binding.theme, (message) =>
        notify(ctx, message)
      );
      apply(ctx, settingsFor(ctx).load());
    } catch (error) {
      notify(
        ctx,
        error instanceof Error
          ? error.message
          : "pi-editor-widgets: cannot acquire the widget host."
      );
    }
  });

  pi.registerCommand("widgets", {
    description: "Arrange editor widgets and footer rows",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/widgets requires interactive TUI mode.", "error");

        return;
      }

      if (args.trim()) {
        ctx.ui.notify("Usage: /widgets", "error");

        return;
      }

      const current = coordinator;

      if (!current?.enabled) {
        notify(
          ctx,
          "pi-editor-widgets is inactive. Resolve the host/footer diagnostic and /reload."
        );

        return;
      }

      if (menuOpen) return;
      menuOpen = true;
      const settings = settingsFor(ctx);
      const preferences = settings.load();

      // Read the host context before the menu loads; a new session can start during the import.
      const ui = ctx.ui;
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, lifetime.signal]) : lifetime.signal;
      const theme = binding?.theme ?? (() => ui.theme);

      try {
        current.apply(preferences.project ?? preferences.global);
        const [{ openResponsiveCustomUI }, { WidgetMenu }] = await loadMenu();
        if (signal.aborted || coordinator !== current) return;
        await openResponsiveCustomUI({
          ui,
          signal,
          useOverlay: () => false,
          create: (tui, _theme, _keys, close) =>
            new WidgetMenu({
              settings,
              preferences,
              coordinator: current,
              theme,
              rows: () => tui.terminal.rows,
              requestRender: () => tui.requestRender(),
              close
            })
        });
      } finally {
        menuOpen = false;
        // Discard the live draft; a successful save has already been applied.
        current.showDraft(undefined);
      }
    }
  });

  pi.on("session_shutdown", () => {
    lifetime.abort();
    coordinator?.dispose();
    coordinator = undefined;
    binding = undefined;
  });
}
