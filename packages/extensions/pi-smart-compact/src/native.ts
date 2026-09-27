import { AgentSession } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import {
  assertCompatible,
  type DefaultCompaction,
  type NativeSession,
  type Prepare
} from "./compatibility.ts";
import type { SummaryModelEntry } from "./entry.ts";
import { compactionResultType, describeOutcome, runRequestedCompaction } from "./outcome.ts";
import { summarizeWithOverrides, type CompactionModelOptions } from "./summarize.ts";

type Registration = {
  active: boolean;
  selection: CompactionModelOptions | undefined;
  onSummarized: ((entry: SummaryModelEntry) => void) | undefined;
  clearSummary?: (() => void) | undefined;
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

/** Identify the operation that owns a default summary by its abort signal. */
function classifySummary(
  session: NativeSession,
  args: Parameters<DefaultCompaction>,
  config: CompactionModelOptions["config"] | undefined
) {
  const [reason, signal] = [args[7], args[5]];
  let trigger: SummaryModelEntry["trigger"] | undefined;

  if (signal !== undefined) {
    // Manual API calls and tool requests share reason: "manual", but use different controllers.
    if (reason === "manual" && signal === session._compactionAbortController?.signal)
      trigger = "manual";
    else if (signal === session._autoCompactionAbortController?.signal)
      trigger = reason === "manual" ? "tool" : reason;
  }

  // Tool overrides are already applied by runWithOverrides; unrelated signals never route.
  const routed =
    trigger !== undefined &&
    trigger !== "tool" &&
    (trigger === "manual" ? config?.applyToManual : config?.applyToAuto);

  return { trigger, routed };
}

/** Wait for Pi's final abort check before appending metadata at its persistence boundary. */
function recordSummaryBeforeCompaction(
  session: NativeSession,
  registration: Registration,
  result: Awaited<ReturnType<DefaultCompaction>>,
  signal: AbortSignal,
  entry: SummaryModelEntry
) {
  if (!registration.onSummarized || signal.aborted) return;
  registration.clearSummary?.();
  const manager = session.sessionManager;
  // Preserve the receiver of retained or borrowed wrappers with apply below.
  // oxlint-disable-next-line typescript/unbound-method
  const append = manager.appendCompaction;
  const hooks = new OwnedHooks();
  let active = true;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "compaction_end") clear();
  });

  const clear = () => {
    active = false;
    unsubscribe();
    signal.removeEventListener("abort", clear);
    hooks.restore();
    if (registration.clearSummary === clear) registration.clearSummary = undefined;
  };

  registration.clearSummary = clear;
  signal.addEventListener("abort", clear, { once: true });

  try {
    hooks.replace(manager, "appendCompaction", function (this: typeof manager, ...args) {
      if (
        !active ||
        this !== manager ||
        args[4] ||
        args[0] !== result.summary ||
        args[1] !== result.firstKeptEntryId
      )
        return append.apply(this, args);

      clear();
      if (registration.active && !signal.aborted) registration.onSummarized?.(entry);

      return append.apply(this, args);
    });
  } catch (error) {
    clear();
    throw error;
  }
}

export function bindNativeCompaction(
  manager: object,
  selection?: CompactionModelOptions,
  onSummarized?: (entry: SummaryModelEntry) => void
) {
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

    const summaryWrapper: DefaultCompaction = async function (this: NativeSession, ...args) {
      const registration = registrations.get(this.sessionManager);
      const selection = registration?.selection;
      const config = selection?.config;
      const { trigger, routed } = classifySummary(this, args, config);
      const configured = config?.model !== undefined || config?.thinkingLevel !== undefined;
      // Pi snapshots thinking before generation; a user may change it while awaiting the summary.
      const thinkingLevel =
        (routed || trigger === "tool" ? config?.thinkingLevel : undefined) ?? this.thinkingLevel;

      const result =
        selection && configured && routed
          ? await summarizeWithOverrides(
              this,
              originalSummary.bind(this),
              args,
              undefined,
              selection
            )
          : await originalSummary.apply(this, args);

      if (registration?.active && trigger !== undefined && args[5])
        recordSummaryBeforeCompaction(this, registration, result, args[5], {
          model: `${args[1].provider}/${args[1].id}`,
          thinkingLevel: args[1].reasoning ? thinkingLevel : "off",
          trigger
        });

      return result;
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
          customType: compactionResultType,
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

  const registration: Registration = { active: true, selection, onSummarized };
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
      registration.clearSummary?.();
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
