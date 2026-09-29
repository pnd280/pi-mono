import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";

import { WidgetCoordinator } from "./coordinator.ts";
import { findWidgetHost } from "./host.ts";
import { WidgetMenu } from "./menu.ts";
import { WidgetSettings, type Preferences } from "./settings.ts";

export default function editorWidgets(pi: ExtensionAPI): void {
  let binding: ReturnType<typeof findWidgetHost>;
  let coordinator: WidgetCoordinator | undefined;
  let lifetime = new AbortController();
  let menuOpen = false;

  const notify = (ctx: ExtensionContext, message: string) => ctx.ui.notify(message, "warning");
  const settingsFor = (ctx: ExtensionContext) =>
    new WidgetSettings({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });

  const apply = (ctx: ExtensionContext, preferences: Preferences) => {
    for (const warning of preferences.warnings) notify(ctx, warning);
    coordinator?.apply(preferences.project ?? preferences.global, preferences.contextThreshold);
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
          "pi-editor-widgets: unsupported Pi widget registry. Use Pi 0.87.1 and /reload, or disable the extension. Native UI was left unchanged."
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
    description: "Arrange editor widgets and footer rows; context/tokens toggle fullscreen details",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/widgets requires interactive TUI mode.", "error");

        return;
      }

      const action = args.trim();

      if (action && action !== "context" && action !== "tokens") {
        ctx.ui.notify("Usage: /widgets [context|tokens]", "error");

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

      if (action === "context" || action === "tokens") {
        if (!current.toggleUsage(action))
          ctx.ui.notify(`/widgets ${action} requires fullscreen TUI mode.`, "error");

        return;
      }

      if (menuOpen) return;
      menuOpen = true;
      const settings = settingsFor(ctx);
      const preferences = settings.load();

      try {
        current.apply(preferences.project ?? preferences.global, preferences.contextThreshold);
        await openResponsiveCustomUI({
          ui: ctx.ui,
          signal: ctx.signal ? AbortSignal.any([ctx.signal, lifetime.signal]) : lifetime.signal,
          useOverlay: () => false,
          create: (tui, _theme, _keys, close) =>
            new WidgetMenu({
              settings,
              preferences,
              coordinator: current,
              theme: binding?.theme ?? (() => ctx.ui.theme),
              rows: () => tui.terminal.rows,
              requestRender: () => tui.requestRender(),
              close,
              apply: (saved) => current.apply(saved.project ?? saved.global, saved.contextThreshold)
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
