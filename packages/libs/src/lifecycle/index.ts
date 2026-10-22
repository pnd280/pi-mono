import type {
  AgentSettledEvent,
  AgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  SessionShutdownEvent
} from "@earendil-works/pi-coding-agent";

import { rendezvous } from "../coordination/index.ts";
import { LifecycleCoordinator, type StartupHandler } from "./coordinator.ts";

export type { StartupAction, StartupArrival, StartupHandler } from "./coordinator.ts";

export type { ShortcutOptions } from "./shortcuts.ts";

export type LifecycleAPI = Pick<ExtensionAPI, "events" | "on" | "registerShortcut">;

/** `at` is the earliest `performance.now()` mark that any participant took for this event. */
export type RunHandler<Event> = (
  event: Event,
  ctx: ExtensionContext,
  at: number
) => Promise<void> | void;

export type LifecycleParticipant = {
  /** Registers a `session_start` handler that takes part in the startup barrier. */
  onSessionStart(handler: StartupHandler): () => void;
  /**
   * Registers a `session_shutdown` handler. The first participant's handler calls every
   * participant's `revoke` synchronously; each participant then runs its own `cleanup`.
   */
  onSessionShutdown(
    revoke: () => void,
    cleanup?: ExtensionHandler<SessionShutdownEvent>
  ): () => void;
  /** Registers an `agent_start` handler that receives the run's shared start mark. */
  onAgentStart(handler: RunHandler<AgentStartEvent>): () => void;
  /** Registers an `agent_settled` handler that receives the run's shared settle mark. */
  onAgentSettled(handler: RunHandler<AgentSettledEvent>): () => void;
};

// Increase when the shared object's shape or behaviour changes.
const protocol = { name: "lifecycle", version: 2 };

/** Call during the extension factory. Every returned method registers through `pi`. */
export function joinLifecycle(pi: LifecycleAPI, options: { id: string }): LifecycleParticipant {
  const coordinator = rendezvous(pi.events, protocol, (host) => new LifecycleCoordinator(host));
  const participant = coordinator.roster.join(options.id);
  let closing = false;
  pi.on("session_start", (_event, ctx) => coordinator.open(participant, pi.events, ctx));

  const registerShortcut: LifecycleAPI["registerShortcut"] = (key, shortcut) =>
    pi.registerShortcut(key, shortcut);

  return {
    onSessionStart: (handler) => {
      if (!closing) {
        closing = true;
        pi.on("resources_discover", (_event, ctx) =>
          coordinator.close(participant, pi.events, ctx)
        );
      }

      return registration((active) =>
        pi.on("session_start", (event, ctx) =>
          active()
            ? coordinator.startup(participant, registerShortcut, event, ctx, handler)
            : undefined
        )
      );
    },
    onSessionShutdown: (revoke, cleanup) => {
      const entry = coordinator.addRevoker(participant, revoke);

      return registration(
        (active) =>
          pi.on("session_shutdown", async (event, ctx) => {
            if (!active()) return;
            // Runs before this handler's first await, so no participant awaits before revoking.
            const revoked = coordinator.revoke(entry, pi.events, event);

            try {
              // Another participant's revoke can dispose this registration.
              if (active()) await cleanup?.(event, ctx);
            } catch (error) {
              if (!revoked) throw error;
              throw new AggregateError(
                [revoked.error, error],
                `revoke failed: ${message(revoked.error)}; cleanup failed: ${message(error)}`
              );
            }

            if (revoked) throw revoked.error;
          }),
        () => coordinator.removeRevoker(entry)
      );
    },
    onAgentStart: (handler) =>
      registration((active) =>
        pi.on("agent_start", (event, ctx) =>
          active() ? handler(event, ctx, coordinator.mark(pi.events, event)) : undefined
        )
      ),
    onAgentSettled: (handler) =>
      registration((active) =>
        pi.on("agent_settled", (event, ctx) =>
          active() ? handler(event, ctx, coordinator.mark(pi.events, event)) : undefined
        )
      )
  };
}

/**
 * Pi snapshots the handlers when an emission starts, so unsubscribing does not stop the current
 * dispatch from calling a handler. Each handler checks `active` and does nothing after disposal.
 */
function registration(
  subscribe: (active: () => boolean) => () => void,
  remove?: () => void
): () => void {
  let active = true;
  const off = subscribe(() => active);

  return () => {
    active = false;
    remove?.();
    off();
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
