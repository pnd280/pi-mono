import type {
  EventBus,
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { Emissions, rendezvous, report, type Host, type Notify } from "../coordination/index.ts";
import {
  WorkingMessageCoordinator,
  completeOrder,
  type WorkingMessageComponent,
  type WorkingMessageHandle
} from "./coordinator.ts";
import type { OrderSettingsScope } from "./order-view.ts";
import { workingMessageSettings, type WorkingMessageSettings } from "./settings.ts";

export type { WorkingMessageComponent, WorkingMessageHandle } from "./coordinator.ts";

export type WorkingMessageRegistration = WorkingMessageComponent & {
  /**
   * The live component with the lowest rank registers `/working-message` through its own
   * extension.
   */
  ownerRank: number;
};

export type WorkingMessageContext = Pick<ExtensionContext, "cwd" | "mode" | "isProjectTrusted"> & {
  ui: Pick<ExtensionUIContext, "setWorkingMessage" | "notify">;
};

export type WorkingMessageAPI = Pick<ExtensionAPI, "events" | "registerCommand"> & {
  on(
    event: "session_start" | "session_shutdown",
    handler: (event: unknown, ctx: WorkingMessageContext) => void
  ): void;
};

type CommandOwner = {
  readonly rank: number;
  readonly contributor: string;
  readonly id: string;
  readonly registerCommand: WorkingMessageAPI["registerCommand"];
};

type Participant = { readonly events: EventBus };

type Shared = {
  register(
    pi: WorkingMessageAPI,
    component: WorkingMessageComponent,
    owner: CommandOwner
  ): WorkingMessageHandle;
  registerOverride(pi: WorkingMessageAPI): WorkingMessageHandle;
};

// Increase when the shared object's shape or behaviour changes.
const protocol = { name: "working-message", version: 1 };

const ownerRankSchema = z.number();

const probeChannel = "pi-mono:coordinator:probe";

// Every participant evaluates this module at startup; only the command needs the menu.
let menuModules: ReturnType<typeof importMenuModules> | undefined;

function importMenuModules() {
  return Promise.all([
    import("./order-view.ts"),
    import("../tui/components/settings-menu/index.ts"),
    import("../tui/responsive-custom-ui/index.ts")
  ]);
}

/** Call during the extension factory. All participants on Pi's event bus share one coordinator. */
export function registerWorkingMessage(
  pi: WorkingMessageAPI,
  registration: WorkingMessageRegistration
): WorkingMessageHandle {
  const { ownerRank, ...component } = registration;
  const rank = ownerRankSchema.parse(ownerRank);

  return rendezvous(pi.events, protocol, installCoordinator).register(pi, component, {
    rank,
    contributor: component.contributor,
    id: component.id,
    registerCommand: (name, options) => pi.registerCommand(name, options)
  });
}

/** Call during the extension factory. While its text is set, it replaces the whole message. */
export function overrideWorkingMessage(pi: WorkingMessageAPI): WorkingMessageHandle {
  return rendezvous(pi.events, protocol, installCoordinator).registerOverride(pi);
}

function installCoordinator(host: Host): Shared {
  const participants = new WeakMap<WorkingMessageAPI, Participant>();
  // A live participant's bus, for version checks outside its handlers.
  let events: EventBus | undefined;
  const coordinator = new WorkingMessageCoordinator<Participant, CommandOwner>(
    (participant) => host.isLive(participant),
    () => events !== undefined && host.disabled(events)
  );
  const starts = new Emissions();
  const reported = new Set<string>();
  const lifetime = new AbortController();
  let settings: WorkingMessageSettings | undefined;
  let menuOpen = false;
  let commandRegistered = false;

  const command: Parameters<WorkingMessageAPI["registerCommand"]>[1] = {
    description: "Inspect and reorder working-message components",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/working-message requires interactive TUI mode.", "error");

        return;
      }

      if (args.trim()) {
        ctx.ui.notify("Usage: /working-message", "error");

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
          isSet: preferences.global !== undefined,
          order: completeOrder(preferences.global ?? [], ids)
        }
      ];
      if (store.projectTrusted)
        scopes.push({
          id: "project",
          label: "project",
          destination: store.paths.project,
          isSet: preferences.project !== undefined,
          order: completeOrder(preferences.project ?? [], ids),
          inheritFrom: "global"
        });
      const items = () =>
        coordinator.snapshot().map((entry) => ({
          id: entry.id,
          label: `${entry.label} [${entry.contributor}]`,
          description: entry.text || "inactive"
        }));

      let stopUpdates = () => {};

      // Read the host context before the menu loads; it can end or change during the import.
      const ui = ctx.ui;
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, lifetime.signal]) : lifetime.signal;

      menuOpen = true;

      try {
        const [{ OrderSettingsView }, { settingsSaveFeedback }, { openResponsiveCustomUI }] =
          await (menuModules ??= importMenuModules());
        if (signal.aborted || settings !== store) return;
        await openResponsiveCustomUI({
          ui,
          signal,
          useOverlay: () => false,
          create: (tui, theme, _keys, close) => {
            const view = new OrderSettingsView({
              title: "Working message",
              items: items(),
              scopes,
              initialScope: preferences.project ? "project" : "global",
              warnings: preferences.warnings,
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
                coordinator.setOrder(saved.project ?? saved.global ?? []);

                return settingsSaveFeedback(
                  destination === "global" && saved.project !== undefined,
                  saved.warnings
                );
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
  };

  /**
   * The participant registers the command when it has the best component of every participant
   * that is live or can still become live. Pi rejects bus calls from a failed factory, but not
   * from a factory that the loader dropped, so such a factory still counts as a candidate.
   */
  const ownsCommand = (participant: Participant): boolean => {
    const candidates = coordinator
      .owners()
      .filter(
        (candidate) =>
          host.isLive(candidate.participant) ||
          (candidate.participant !== participant && busActive(candidate.participant))
      );
    const best = candidates.reduce<CommandOwner | undefined>(
      (found, { owner }) => (found && compareOwners(found, owner) <= 0 ? found : owner),
      undefined
    );

    return candidates.some(
      (candidate) =>
        candidate.participant === participant &&
        best !== undefined &&
        compareOwners(candidate.owner, best) === 0
    );
  };

  const join = (pi: WorkingMessageAPI): Participant => {
    const existing = participants.get(pi);
    if (existing) return existing;
    const participant: Participant = { events: pi.events };
    participants.set(pi, participant);

    pi.on("session_start", (_event, ctx) => {
      const notify: Notify | undefined =
        ctx.mode === "tui" ? (message, type) => ctx.ui.notify(message, type) : undefined;
      if (host.markLive(participant)) events ??= pi.events;
      host.warnIfDisabled(pi.events, notify);

      if (starts.first(ctx)) {
        settings = workingMessageSettings({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
        const preferences = settings.load();
        coordinator.start(preferences.project ?? preferences.global ?? []);
        if (ctx.mode === "tui")
          for (const warning of preferences.warnings)
            ctx.ui.notify(`@pi-mono/libs: ${warning}`, "warning");
      }

      coordinator.attach(
        participant,
        ctx.mode === "tui" ? (text) => ctx.ui.setWorkingMessage(text) : undefined
      );

      for (const id of coordinator.duplicates())
        if (!reported.has(id)) {
          reported.add(id);
          report(
            notify,
            `@pi-mono/libs: working-message component ${id} is registered more than once, so it is not shown.`,
            "warning"
          );
        }

      // Commands registered here are ready before Pi sets up autocomplete and dispatch.
      if (!commandRegistered && ownsCommand(participant)) {
        commandRegistered = true;
        pi.registerCommand("working-message", command);
      }
    });
    pi.on("session_shutdown", () => {
      lifetime.abort();
      coordinator.shutdown();
      settings = undefined;
    });

    return participant;
  };

  return {
    register: (pi, component, owner) => coordinator.register(join(pi), component, owner),
    registerOverride: (pi) => coordinator.registerOverride(join(pi))
  };
}

function busActive({ events }: Participant): boolean {
  try {
    events.emit(probeChannel, undefined);

    return true;
  } catch {
    return false;
  }
}

function compareOwners(a: CommandOwner, b: CommandOwner): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.contributor !== b.contributor) return a.contributor < b.contributor ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;

  return 0;
}
