import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext
} from "@earendil-works/pi-coding-agent";

import {
  Emissions,
  Registry,
  Roster,
  rendezvous,
  reportFailure,
  uiNotify,
  type Host,
  type Participant
} from "../coordination/index.ts";

export type PromptPartsAPI = Pick<ExtensionAPI, "events" | "on">;

/** Returns text to append for this run, or `undefined` or `""` to add nothing. */
export type PromptPart = (
  ctx: ExtensionContext,
  event: BeforeAgentStartEvent
) => string | undefined;

export type PromptPartsParticipant = {
  /** Delays every part until `pending` settles. Its result and errors stay with the caller. */
  hold(pending: PromiseLike<unknown>): void;
  /** Appends text in ascending rank. Returns a function that removes the part. */
  part(rank: number, part: PromptPart): () => void;
};

type Shared = {
  host: Host;
  roster: Roster;
  emissions: Emissions;
  parts: Registry<PromptPart>;
  holds: Map<Promise<void>, Participant>;
};

// Increase when the shared object's shape or behaviour changes.
const protocol = { name: "prompt-parts", version: 1 };

const separator = "\n\n";

/** Call during the extension factory. The first live participant's handler appends every part. */
export function joinPromptParts(
  pi: PromptPartsAPI,
  options: { id: string }
): PromptPartsParticipant {
  const shared = rendezvous(pi.events, protocol, install);
  const participant = shared.roster.join(options.id);
  pi.on("session_start", (_event, ctx) => shared.roster.arrive(participant, pi.events, ctx));
  pi.on("before_agent_start", async (event, ctx) => {
    // After a version mismatch, each participant appends only its own parts.
    if (shared.host.disabled(pi.events)) return appendParts(shared, participant, event, ctx);
    if (shared.emissions.first(ctx)) return appendParts(shared, undefined, event, ctx);
  });

  return {
    hold: (pending) => {
      const settled = Promise.resolve(pending).then(
        () => undefined,
        () => undefined
      );
      shared.holds.set(settled, participant);
      void settled.then(() => shared.holds.delete(settled));
    },
    part: (rank, part) => shared.parts.register(participant, rank, part)
  };
}

function install(host: Host): Shared {
  return {
    host,
    roster: new Roster(host),
    emissions: new Emissions(),
    parts: new Registry(),
    holds: new Map()
  };
}

async function appendParts(
  shared: Shared,
  only: Participant | undefined,
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext
): Promise<void> {
  await settleHolds(shared.holds, only);
  const notify = uiNotify(ctx);
  const texts: string[] = [];

  for (const entry of shared.parts.ordered(only)) {
    if (!shared.parts.has(entry)) continue;

    try {
      const text = entry.value(ctx, event);
      if (text) texts.push(text);
    } catch (error) {
      reportFailure(notify, entry.participant, "prompt part", error);
    }
  }

  if (texts.length === 0) return;
  // Pi shares these options with every before_agent_start handler of the run.
  const options = event.systemPromptOptions;
  options.appendSystemPrompt = [options.appendSystemPrompt, ...texts]
    .filter((text) => text !== "")
    .join(separator);
}

/** Waits until no active participant holds the run, including holds added while waiting. */
async function settleHolds(
  holds: Map<Promise<void>, Participant>,
  only: Participant | undefined
): Promise<void> {
  for (
    let pending = activeHolds(holds, only);
    pending.length > 0;
    pending = activeHolds(holds, only)
  )
    await Promise.all(pending);
}

function activeHolds(
  holds: Map<Promise<void>, Participant>,
  only: Participant | undefined
): Promise<void>[] {
  return [...holds].flatMap(([settled, participant]) =>
    (only ? participant === only : true) && participant.active() ? [settled] : []
  );
}
