import { AgentSession } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import { assertCompatible, type Prepare } from "./compatibility.ts";
import { describeOutcome, runRequestedCompaction } from "./outcome.ts";
import type { CompactionModelOptions } from "./summarize.ts";

type Registration = {
  active: boolean;
  selection: CompactionModelOptions | undefined;
  pending?: { instructions?: string | undefined; signal?: AbortSignal | undefined } | undefined;
};

type Patch = {
  original: Prepare;
  wrapper: Prepare;
  hooks: OwnedHooks;
  registrations: Map<object, Registration>;
};

const patchKey = Symbol.for("pi-smart-compact.native.v2");

type Prototype = {
  _compactBeforeNextAssistantResponse: Prepare;
  [patchKey]?: Patch;
};

function hasBoundary(value: object): value is Prototype {
  return typeof Reflect.get(value, "_compactBeforeNextAssistantResponse") === "function";
}

export function bindNativeCompaction(manager: object, selection?: CompactionModelOptions) {
  const prototype: object = AgentSession.prototype;
  if (!hasBoundary(prototype))
    throw new Error("pi-smart-compact: missing native compaction boundary.");
  let patch = prototype[patchKey];
  assertCompatible(prototype, patch?.original ?? prototype._compactBeforeNextAssistantResponse);

  if (patch && prototype._compactBeforeNextAssistantResponse !== patch.wrapper) {
    throw new Error("pi-smart-compact: another extension replaced the compaction boundary.");
  }

  if (!patch) {
    const registrations = new Map<object, Registration>();
    const original = prototype._compactBeforeNextAssistantResponse;
    const hooks = new OwnedHooks();

    const wrapper: Prepare = async function (context) {
      const registration = registrations.get(this.sessionManager);
      const request = registration?.pending;
      if (!registration || !request) return original.call(this, context);
      // Consume before awaiting; a failed, cancelled, or skipped request is still one-shot.
      registration.pending = undefined;
      if (request.signal?.aborted || this._agentRunAbortRequested) return context;

      const outcome = await runRequestedCompaction(
        this,
        request.instructions,
        registration.selection
      );

      // Native compaction already records success and supplies the model's summary.
      if (registration.active && outcome.status !== "completed") {
        // Public sendMessage defers while streaming, missing this next response.
        // The tool batch is already persisted here, so native append is safe and
        // reports the outcome without queueing or requesting another turn.
        this._appendCustomMessage({
          role: "custom",
          customType: "smart-compaction-result",
          content: describeOutcome(outcome),
          display: true,
          details: outcome,
          timestamp: Date.now()
        });
      }

      return { ...context, messages: this.sessionManager.buildSessionProjection().messages };
    };

    patch = { original, wrapper, hooks, registrations };
    hooks.replace(prototype, "_compactBeforeNextAssistantResponse", wrapper);
    prototype[patchKey] = patch;
  }

  if (patch.registrations.has(manager)) {
    throw new Error("pi-smart-compact is already bound to this session.");
  }

  const registration: Registration = { active: true, selection };
  patch.registrations.set(manager, registration);

  return {
    request(instructions?: string, signal?: AbortSignal) {
      if (!registration.active) throw new Error("pi-smart-compact binding has been disposed.");
      signal?.throwIfAborted();
      registration.pending = { instructions, signal };
    },
    clear() {
      registration.pending = undefined;
    },
    dispose() {
      if (!registration.active) return;
      registration.active = false;
      registration.pending = undefined;
      patch.registrations.delete(manager);

      if (
        patch.registrations.size === 0 &&
        prototype._compactBeforeNextAssistantResponse === patch.wrapper
      ) {
        // Empty registrations deactivate retained wrappers before restoration.
        patch.hooks.restore();
        if (prototype._compactBeforeNextAssistantResponse === patch.original)
          delete prototype[patchKey];
      }
    }
  };
}
