import type {
  AgentSettledEvent,
  AgentStartEvent,
  EventBus,
  ExtensionContext,
  SessionShutdownEvent,
  SessionStartEvent
} from "@earendil-works/pi-coding-agent";

import {
  Emissions,
  Registry,
  Roster,
  reportFailure,
  uiNotify,
  type Entry,
  type Host,
  type Participant
} from "../coordination/index.ts";
import { resolveShortcutClaims, type ShortcutClaim, type ShortcutOptions } from "./shortcuts.ts";

export type StartupAction = (ctx: ExtensionContext) => Promise<void> | void;

export type StartupArrival = {
  /** Runs after every `session_start` handler, in ascending rank. */
  commit(rank: number, action: StartupAction): void;
  /** Registers `key` through this participant unless another claim overlaps it. */
  claimShortcut(key: string, options: ShortcutOptions): void;
};

export type StartupHandler = (
  event: SessionStartEvent,
  ctx: ExtensionContext,
  arrival: StartupArrival
) => Promise<void> | void;

type Barrier = {
  readonly commits: Registry<StartupAction>;
  readonly claims: Registry<ShortcutClaim>;
};

/** Shared by every participant of one protocol version in one runtime. */
export class LifecycleCoordinator {
  readonly roster: Roster;
  private readonly opened = new Emissions();
  private readonly closed = new Emissions();
  private readonly revokers = new Registry<() => void>();
  // Pi builds a new event for each `session_shutdown`, `agent_start`, and `agent_settled`.
  private readonly phases = new WeakMap<
    object,
    Map<Entry<() => void>, { error: unknown } | undefined>
  >();
  private readonly marks = new WeakMap<object, number>();
  private barrier: Barrier = newBarrier();

  constructor(private readonly host: Host) {
    this.roster = new Roster(host);
  }

  /** Call from each participant's first `session_start` handler. */
  open(participant: Participant, events: EventBus, ctx: ExtensionContext): void {
    if (this.opened.first(ctx)) this.barrier = newBarrier();
    this.roster.arrive(participant, events, ctx);
  }

  /** Runs one participant's startup handler. Its arrival closes when the handler settles. */
  async startup(
    participant: Participant,
    registerShortcut: ShortcutClaim["registerShortcut"],
    event: SessionStartEvent,
    ctx: ExtensionContext,
    handler: StartupHandler
  ): Promise<void> {
    const barrier = this.barrier;
    let open = true;

    const assertOpen = () => {
      if (!open) throw new Error(`${participant.id}: startup arrival has already settled.`);
    };

    try {
      await handler(event, ctx, {
        commit: (rank, action) => {
          assertOpen();
          barrier.commits.add(participant, rank, action);
        },
        claimShortcut: (key, options) => {
          assertOpen();
          barrier.claims.add(participant, 0, { key, options, registerShortcut });
        }
      });
    } finally {
      open = false;
    }
  }

  /**
   * Call from the `resources_discover` handler of each participant with a startup handler. Pi
   * emits it after every `session_start` handler. The first call resolves every claim and runs
   * every commit.
   */
  async close(participant: Participant, events: EventBus, ctx: ExtensionContext): Promise<void> {
    const notify = uiNotify(ctx);
    const own = this.host.disabled(events);
    if (!own && !this.closed.first(ctx)) return;
    const only = own ? participant : undefined;
    resolveShortcutClaims(this.barrier.claims.take(only), notify);

    for (const entry of this.barrier.commits.take(only)) {
      try {
        await entry.value(ctx);
      } catch (error) {
        reportFailure(notify, entry.participant, "session_start commit", error);
      }
    }
  }

  /**
   * Call synchronously at the start of a participant's `session_shutdown` handler. The first
   * call of an emission runs every active revoke. A revoke outside that pass, such as one of a
   * participant with a duplicate ID, runs in its own handler. Returns this revoke's failure.
   */
  revoke(
    own: Entry<() => void>,
    events: EventBus,
    event: SessionShutdownEvent
  ): { error: unknown } | undefined {
    if (this.host.disabled(events)) return runRevoke(own);
    let ran = this.phases.get(event);

    if (!ran) {
      ran = new Map();
      for (const entry of this.revokers.ordered())
        if (this.revokers.has(entry)) ran.set(entry, runRevoke(entry));
      this.phases.set(event, ran);
    }

    if (!ran.has(own)) ran.set(own, runRevoke(own));

    return ran.get(own);
  }

  addRevoker(participant: Participant, revoke: () => void): Entry<() => void> {
    // Revokes share one rank, so participant ID and registration order decide.
    return this.revokers.add(participant, 0, revoke);
  }

  removeRevoker(entry: Entry<() => void>): void {
    this.revokers.remove(entry);
  }

  /** The earliest mark of this emission, so every participant sees the same time. */
  mark(events: EventBus, event: AgentStartEvent | AgentSettledEvent): number {
    if (this.host.disabled(events)) return performance.now();
    let at = this.marks.get(event);

    if (at === undefined) {
      at = performance.now();
      this.marks.set(event, at);
    }

    return at;
  }
}

function newBarrier(): Barrier {
  return { commits: new Registry(), claims: new Registry() };
}

function runRevoke(entry: Entry<() => void>): { error: unknown } | undefined {
  try {
    entry.value();

    return undefined;
  } catch (error) {
    return { error };
  }
}
