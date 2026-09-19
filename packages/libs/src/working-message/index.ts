import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import {
  OrderSettingsView,
  type OrderSettingsScope
} from "../tui/components/order-settings/index.ts";
import { openResponsiveCustomUI } from "../tui/responsive-custom-ui/index.ts";
import {
  WorkingMessageCoordinator,
  completeOrder,
  type WorkingMessageComponent,
  type WorkingMessageHandle
} from "./coordinator.ts";
import { WorkingMessageSettings } from "./settings.ts";

export type { WorkingMessageComponent, WorkingMessageHandle } from "./coordinator.ts";

export type WorkingMessageContext = Pick<ExtensionContext, "cwd" | "mode" | "isProjectTrusted"> & {
  ui: Pick<ExtensionUIContext, "setWorkingMessage" | "notify">;
};

export type WorkingMessageAPI = Pick<ExtensionAPI, "events" | "registerCommand"> & {
  on(
    event: "session_start" | "session_shutdown",
    handler: (event: unknown, ctx: WorkingMessageContext) => void
  ): void;
};

const discoveryChannel = "pi-mono:working-message:coordinator";
const discoveryRequestSchema = z.function({
  input: [z.instanceof(WorkingMessageCoordinator)],
  output: z.void()
});

/** Call during the extension factory. All participants on Pi's event bus share one owner. */
export function registerWorkingMessage(
  pi: WorkingMessageAPI,
  component: WorkingMessageComponent
): WorkingMessageHandle {
  let shared: WorkingMessageCoordinator | undefined;
  // Pi dispatches bus listeners synchronously, even though it catches async handler failures.
  // A callback rendezvous also works when Pi loads separate copies of this library via jiti.
  pi.events.emit(discoveryChannel, (coordinator: WorkingMessageCoordinator) => {
    shared = coordinator;
  });
  const coordinator = shared ?? installCoordinator(pi);

  return coordinator.register(component);
}

function installCoordinator(pi: WorkingMessageAPI): WorkingMessageCoordinator {
  const coordinator = new WorkingMessageCoordinator();
  const lifetime = new AbortController();
  let settings: WorkingMessageSettings | undefined;
  let projectTrusted = false;
  let menuOpen = false;
  const unsubscribe = pi.events.on(discoveryChannel, (request: unknown) => {
    // This private channel carries callbacks created by registerWorkingMessage,
    // including callbacks from a separately loaded copy of this module.
    const parsed = discoveryRequestSchema.safeParse(request);
    if (parsed.success) parsed.data(coordinator);
  });

  pi.on("session_start", (_event, ctx) => {
    projectTrusted = ctx.isProjectTrusted();
    settings = new WorkingMessageSettings({ cwd: ctx.cwd, projectTrusted });
    const preferences = settings.load();
    coordinator.start(
      ctx.mode === "tui" ? (text) => ctx.ui.setWorkingMessage(text) : undefined,
      preferences.project ?? preferences.global
    );
    if (ctx.mode === "tui")
      for (const warning of preferences.warnings) ctx.ui.notify(warning, "warning");
  });
  pi.on("session_shutdown", () => {
    lifetime.abort();
    unsubscribe();
    coordinator.shutdown();
    settings = undefined;
  });
  pi.registerCommand("working-message", {
    description: "Inspect and reorder working-message components (global or project)",
    getArgumentCompletions: (prefix) =>
      ["global", "project"]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const scope = args.trim();

      if (ctx.mode !== "tui") {
        ctx.ui.notify("/working-message requires interactive TUI mode.", "error");

        return;
      }

      if (scope && scope !== "global" && scope !== "project") {
        ctx.ui.notify("Usage: /working-message [global|project]", "error");

        return;
      }

      if (scope === "project" && !projectTrusted) {
        ctx.ui.notify("Trust this project before editing project settings.", "error");

        return;
      }

      if (!settings || lifetime.signal.aborted || menuOpen) return;
      const store = settings;
      const preferences = store.load();
      const ids = coordinator.snapshot().map((entry) => entry.id);
      const scopes: OrderSettingsScope[] = [
        {
          id: "global",
          label: "global",
          destination: store.paths.global,
          order: completeOrder(preferences.global, ids)
        }
      ];
      if (projectTrusted)
        scopes.push({
          id: "project",
          label: "project",
          destination: store.paths.project,
          order: completeOrder(preferences.project ?? preferences.global, ids)
        });
      const items = () =>
        coordinator.snapshot().map((entry) => ({
          id: entry.id,
          label: `${entry.label} [${entry.contributor}]`,
          description: entry.text || "inactive"
        }));

      let stopUpdates = () => {};

      menuOpen = true;

      try {
        await openResponsiveCustomUI({
          ui: ctx.ui,
          signal: ctx.signal ? AbortSignal.any([ctx.signal, lifetime.signal]) : lifetime.signal,
          useOverlay: (tui) => tui.mode === "fullscreen",
          overlayOptions: { width: "100%", maxHeight: "100%", anchor: "center" },
          create: (tui, theme, _keys, close) => {
            const view = new OrderSettingsView({
              title: "Working message",
              items: items(),
              scopes,
              initialScope: scope || (preferences.project ? "project" : "global"),
              theme,
              rows: () => tui.terminal.rows,
              requestRender: () => tui.requestRender(),
              close,
              save: (destination, order) => {
                if (lifetime.signal.aborted) throw new Error("This session has ended.");
                if (destination !== "global" && destination !== "project")
                  throw new Error("Unknown save scope.");
                store.save(destination, order);
                const saved = store.load();
                coordinator.setOrder(saved.project ?? saved.global);

                return destination === "global" && saved.project
                  ? "Saved globally; the project override remains active."
                  : "Saved and applied.";
              }
            });
            stopUpdates = coordinator.subscribe(() => view.updateItems(items()));

            return view;
          }
        });
      } finally {
        stopUpdates();
        menuOpen = false;
      }
    }
  });

  return coordinator;
}
