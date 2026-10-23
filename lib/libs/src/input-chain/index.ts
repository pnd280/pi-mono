import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  InputEvent,
  InputEventResult
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

export type InputChainAPI = Pick<ExtensionAPI, "events" | "on">;

/** Receives the input as it reached the chain. Its return value is ignored. */
export type InputObserver = ExtensionHandler<InputEvent>;

/** Returns Pi's `input` result. `transform` feeds the next transform; `handled` ends the chain. */
export type InputTransform = ExtensionHandler<InputEvent, InputEventResult>;

export type InputChainParticipant = {
  /** Runs before every transform, in participant ID order. Returns a function that removes it. */
  observe(observer: InputObserver): () => void;
  /** Runs in ascending rank after all observers. Returns a function that removes it. */
  transform(rank: number, transform: InputTransform): () => void;
};

type Shared = {
  host: Host;
  roster: Roster;
  emissions: Emissions;
  observers: Registry<InputObserver>;
  transforms: Registry<InputTransform>;
};

// Increase when the shared object's shape or behaviour changes.
const protocol = { name: "input-chain", version: 1 };

/** Call during the extension factory. The first live participant's `input` handler runs the chain. */
export function joinInputChain(pi: InputChainAPI, options: { id: string }): InputChainParticipant {
  const shared = rendezvous(pi.events, protocol, install);
  const participant = shared.roster.join(options.id);
  pi.on("session_start", (_event, ctx) => shared.roster.arrive(participant, pi.events, ctx));
  pi.on("input", (event, ctx) => {
    // After a version mismatch, each participant runs only its own chain.
    if (shared.host.disabled(pi.events)) return runChain(shared, participant, event, ctx);

    return shared.emissions.first(ctx) ? runChain(shared, undefined, event, ctx) : undefined;
  });

  return {
    // Observers share one rank, so participant ID and registration order decide.
    observe: (observer) => shared.observers.register(participant, 0, observer),
    transform: (rank, transform) => shared.transforms.register(participant, rank, transform)
  };
}

function install(host: Host): Shared {
  return {
    host,
    roster: new Roster(host),
    emissions: new Emissions(),
    observers: new Registry(),
    transforms: new Registry()
  };
}

/** Follows Pi's own input chain: a fresh event per callback, and errors do not stop it. */
async function runChain(
  shared: Shared,
  only: Participant | undefined,
  event: InputEvent,
  ctx: ExtensionContext
): Promise<InputEventResult> {
  const notify = uiNotify(ctx);

  for (const entry of shared.observers.ordered(only)) {
    if (!shared.observers.has(entry)) continue;

    try {
      await entry.value(inputEvent(event, event.text, event.images), ctx);
    } catch (error) {
      reportFailure(notify, entry.participant, "input observer", error);
    }
  }

  let text = event.text;
  let images = event.images;

  for (const entry of shared.transforms.ordered(only)) {
    if (!shared.transforms.has(entry)) continue;

    try {
      const result = await entry.value(inputEvent(event, text, images), ctx);
      if (result?.action === "handled") return result;

      if (result?.action === "transform") {
        text = result.text;
        images = result.images ?? images;
      }
    } catch (error) {
      reportFailure(notify, entry.participant, "input transform", error);
    }
  }

  if (text === event.text && images === event.images) return { action: "continue" };

  return images ? { action: "transform", text, images } : { action: "transform", text };
}

function inputEvent(original: InputEvent, text: string, images: InputEvent["images"]): InputEvent {
  const event: InputEvent = { type: "input", text, source: original.source };
  if (images) event.images = images;
  if (original.streamingBehavior) event.streamingBehavior = original.streamingBehavior;

  return event;
}
