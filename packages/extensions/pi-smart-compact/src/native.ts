import { AgentSession } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import {
  assertCompatible,
  type DefaultCompaction,
  type NativeSession,
  type Prepare
} from "./compatibility.ts";
import { describeOutcome, runRequestedCompaction } from "./outcome.ts";
import { summarizeWithOverrides, type CompactionModelOptions } from "./summarize.ts";

type Registration = {
  active: boolean;
  selection: CompactionModelOptions | undefined;
  pending?: { instructions?: string | undefined; signal?: AbortSignal | undefined } | undefined;
};

type Patch = {
  original: Prepare;
  wrapper: Prepare;
  originalSummary: DefaultCompaction;
  summaryWrapper: DefaultCompaction;
  hooks: OwnedHooks;
  registrations: Map<object, Registration>;
};

const patchKey = Symbol.for("pi-smart-compact.native.v3");

type Prototype = {
  _compactBeforeNextAssistantResponse: Prepare;
  _runDefaultCompaction: DefaultCompaction;
  [patchKey]?: Patch;
};

function hasCompactionMethods(value: object): value is Prototype {
  return (
    typeof Reflect.get(value, "_compactBeforeNextAssistantResponse") === "function" &&
    typeof Reflect.get(value, "_runDefaultCompaction") === "function"
  );
}

export function bindNativeCompaction(manager: object, selection?: CompactionModelOptions) {
  const prototype: object = AgentSession.prototype;
  if (!hasCompactionMethods(prototype))
    throw new Error("pi-smart-compact: missing native compaction boundary.");
  let patch = prototype[patchKey];
  assertCompatible(
    prototype,
    patch?.original ?? prototype._compactBeforeNextAssistantResponse,
    patch?.originalSummary ?? prototype._runDefaultCompaction
  );

  if (
    patch &&
    (prototype._compactBeforeNextAssistantResponse !== patch.wrapper ||
      prototype._runDefaultCompaction !== patch.summaryWrapper)
  ) {
    throw new Error("pi-smart-compact: another extension replaced the compaction boundary.");
  }

  if (!patch) {
    const registrations = new Map<object, Registration>();
    const original = prototype._compactBeforeNextAssistantResponse;
    const originalSummary = prototype._runDefaultCompaction;
    const hooks = new OwnedHooks();

    const summaryWrapper: DefaultCompaction = function (this: NativeSession, ...args) {
      const selection = registrations.get(this.sessionManager)?.selection;
      const config = selection?.config;
      const reason = args[7];
      const signal = args[5];

      // Manual API calls share reason: "manual" with tool requests, which route
      // separately. Match each operation's own controller so tool, reentrant, and
      // non-opted-in summaries remain untouched.
      const routed =
        reason === "manual"
          ? config?.applyToManual && signal === this._compactionAbortController?.signal
          : config?.applyToAuto && signal === this._autoCompactionAbortController?.signal;

      if (
        selection &&
        routed &&
        signal !== undefined &&
        (selection.config.model !== undefined || selection.config.thinkingLevel !== undefined)
      ) {
        return summarizeWithOverrides(this, originalSummary.bind(this), args, undefined, selection);
      }

      return originalSummary.apply(this, args);
    };

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

    patch = { original, wrapper, originalSummary, summaryWrapper, hooks, registrations };

    try {
      hooks.replace(prototype, "_compactBeforeNextAssistantResponse", wrapper);
      hooks.replace(prototype, "_runDefaultCompaction", summaryWrapper);
      prototype[patchKey] = patch;
    } catch (error) {
      hooks.restore();
      throw error;
    }
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
        prototype._compactBeforeNextAssistantResponse === patch.wrapper &&
        prototype._runDefaultCompaction === patch.summaryWrapper
      ) {
        // Empty registrations deactivate retained wrappers before restoration.
        patch.hooks.restore();
        if (prototype._compactBeforeNextAssistantResponse === patch.original)
          delete prototype[patchKey];
      }
    }
  };
}
