import type { EventBus } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

export type Notify = (message: string, type: "warning" | "error") => void;

export type NotifyContext = {
  hasUI: boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
};

type Protocol = { readonly name: string; readonly version: number };

/**
 * The rendezvous envelope. Its shape is fixed for every protocol version, so copies with
 * different versions still find each other, tell whether the other version is live, and warn
 * about the mismatch once.
 */
type Offer<Shared> = {
  readonly version: number;
  readonly shared: Shared;
  live(): boolean;
  warned(): boolean;
};

const participantIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/)
  .max(200);

const rankSchema = z.number();

/** Shared by every participant of one protocol version in one runtime. */
export class Host {
  private readonly live = new WeakSet<object>();
  private anyLive = false;
  private warned = false;

  constructor(
    readonly protocol: Protocol,
    private readonly channel: string
  ) {}

  /**
   * Call from the participant's own `session_start` handler. Pi runs no handler of an extension
   * whose factory failed or that the loader dropped, so only these participants become live.
   * Returns true the first time.
   */
  markLive(participant: object): boolean {
    if (this.live.has(participant)) return false;
    this.live.add(participant);
    this.anyLive = true;

    return true;
  }

  isLive(participant: object): boolean {
    return this.live.has(participant);
  }

  hasLive(): boolean {
    return this.anyLive;
  }

  /** True when a live participant uses another protocol version. */
  disabled(events: EventBus): boolean {
    return offers(events, this.channel).some(
      (offer) => offer.version !== this.protocol.version && offer.live()
    );
  }

  /**
   * Call from each participant's `session_start` handler after `markLive`. The first participant
   * that sees live participants of another version warns, once per runtime.
   */
  warnIfDisabled(events: EventBus, notify: Notify | undefined): void {
    const found = offers(events, this.channel);
    if (found.some((offer) => offer.warned())) return;
    if (!found.some((offer) => offer.version !== this.protocol.version && offer.live())) return;
    this.warned = true;
    const { name } = this.protocol;
    report(
      notify,
      `@pi-mono/libs: extensions use different ${name} protocol versions, so each extension runs its own ${name} behaviour. Update them to one @pi-mono/libs release.`,
      "warning"
    );
  }

  hasWarned(): boolean {
    return this.warned;
  }
}

/**
 * Joins the coordinator of `protocol` for this runtime, or installs it when no participant of
 * this version answers. Participants of other versions get their own coordinator.
 */
export function rendezvous<Shared>(
  events: EventBus,
  protocol: Protocol,
  install: (host: Host) => Shared
): Shared {
  const channel = `pi-mono:coordinator:${protocol.name}`;
  let offer = offers<Shared>(events, channel).find((answer) => answer.version === protocol.version);

  if (!offer) {
    const host = new Host(protocol, channel);
    offer = {
      version: protocol.version,
      shared: install(host),
      live: () => host.hasLive(),
      warned: () => host.hasWarned()
    };
  }

  const answer = offer;
  // Every participant answers for its version. Pi removes the subscriptions of a failed
  // factory, so the coordinator stays reachable while any participant that joined it remains.
  events.on(channel, (request: unknown) => {
    if (typeof request === "function") Reflect.apply(request, undefined, [answer]);
  });

  return answer.shared;
}

function offers<Shared>(events: EventBus, channel: string): Offer<Shared>[] {
  const found = new Set<Offer<Shared>>();
  // Pi dispatches bus listeners synchronously. A callback rendezvous also works across the
  // separate copies of this library that Pi loads for each extension.
  events.emit(channel, (answer: Offer<Shared>) => {
    found.add(answer);
  });

  return [...found];
}

/** Pi creates one context for each emission and passes it to every handler of the emission. */
export class Emissions {
  private readonly seen = new WeakSet<object>();

  /** True for the first call with this emission's context. */
  first(ctx: object): boolean {
    if (this.seen.has(ctx)) return false;
    this.seen.add(ctx);

    return true;
  }
}

export type Participant = {
  readonly id: string;
  /** True when the participant is live and no other live participant has its ID. */
  active(): boolean;
};

/** Participants with IDs. Ties between equal ranks are broken by ID. */
export class Roster {
  private readonly live: Participant[] = [];

  constructor(private readonly host: Host) {}

  join(id: string): Participant {
    const parsed = participantIdSchema.parse(id);
    const participant: Participant = {
      id: parsed,
      active: () => this.host.isLive(participant) && this.count(parsed) === 1
    };

    return participant;
  }

  /**
   * Call first in the participant's own `session_start` handler: marks it live, warns about a
   * version mismatch, and throws when it becomes live while another live participant has its ID.
   */
  arrive(participant: Participant, events: EventBus, ctx: NotifyContext): void {
    if (!this.host.markLive(participant)) return;
    this.live.push(participant);
    this.host.warnIfDisabled(events, uiNotify(ctx));
    if (this.count(participant.id) > 1)
      throw new Error(
        `Duplicate ${this.host.protocol.name} participant: ${participant.id}. No participant with this ID takes part.`
      );
  }

  private count(id: string): number {
    return this.live.filter((participant) => participant.id === id).length;
  }
}

export type Entry<T> = {
  readonly rank: number;
  readonly participant: Participant;
  readonly index: number;
  readonly value: T;
};

/** Ranked registrations from all participants. Order never depends on join order. */
export class Registry<T> {
  private readonly entries = new Set<Entry<T>>();
  private next = 0;

  add(participant: Participant, rank: number, value: T): Entry<T> {
    const entry = { rank: rankSchema.parse(rank), participant, index: this.next++, value };
    this.entries.add(entry);

    return entry;
  }

  /** Returns a function that removes the registration. */
  register(participant: Participant, rank: number, value: T): () => void {
    const entry = this.add(participant, rank, value);

    return () => this.remove(entry);
  }

  remove(entry: Entry<T>): void {
    this.entries.delete(entry);
  }

  /**
   * Active registrations by rank, then participant ID, then registration order. With `only`,
   * returns that participant's registrations.
   */
  ordered(only?: Participant): Entry<T>[] {
    return [...this.entries]
      .filter((entry) => (only ? entry.participant === only : true) && entry.participant.active())
      .sort(compareOrder);
  }

  /** Removes and returns the registrations that `ordered` returns. */
  take(only?: Participant): Entry<T>[] {
    const entries = this.ordered(only);
    for (const entry of entries) this.remove(entry);

    return entries;
  }

  /** False after the registration was disposed, including during a running dispatch. */
  has(entry: Entry<T>): boolean {
    return this.entries.has(entry);
  }
}

function compareOrder(a: Entry<unknown>, b: Entry<unknown>): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.participant.id !== b.participant.id) return a.participant.id < b.participant.id ? -1 : 1;

  return a.index - b.index;
}

export function uiNotify(ctx: NotifyContext): Notify | undefined {
  return ctx.hasUI ? (message, type) => ctx.ui.notify(message, type) : undefined;
}

export function report(
  notify: Notify | undefined,
  message: string,
  type: "warning" | "error"
): void {
  if (notify) notify(message, type);
  else if (type === "error") console.error(message);
  else console.warn(message);
}

/** Pi cannot attribute an error to another extension, so the text names the participant. */
export function reportFailure(
  notify: Notify | undefined,
  participant: Participant,
  what: string,
  error: unknown
): void {
  report(
    notify,
    `${participant.id}: ${what} failed: ${error instanceof Error ? error.message : String(error)}`,
    "error"
  );
}
