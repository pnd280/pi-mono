import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  convertToLlm,
  type ExtensionRunner,
  type ModelRegistry
} from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import {
  virtualModelApi,
  type AutoCompaction,
  type DefaultCompaction,
  type NativeSession
} from "./compatibility.ts";
import type { CompactConfig } from "./config.ts";
import type { SummaryModelEntry } from "./entry.ts";
import { focusSplitTurn } from "./instructions.ts";

export type CompactionModelOptions = {
  config: CompactConfig;
  registry: Pick<ModelRegistry, "find" | "streamSimple">;
};

export async function summarizeWithOverrides(
  session: NativeSession,
  summarize: DefaultCompaction,
  args: Readonly<Parameters<DefaultCompaction>>,
  instructions: string | undefined,
  overrides: CompactionModelOptions | undefined
): Promise<{
  result: Awaited<ReturnType<DefaultCompaction>>;
  selection: Pick<SummaryModelEntry, "model" | "thinkingLevel">;
}> {
  const reference = overrides?.config.model;
  const inputThinkingLevel = overrides?.config.thinkingLevel;
  let selectedModel = args[1];

  if (overrides && reference !== undefined) {
    const slash = reference.indexOf("/");
    const model = overrides.registry.find(reference.slice(0, slash), reference.slice(slash + 1));
    if (!model)
      throw new Error(
        "The configured compaction model is unavailable. Check ext.pi-smart-compact.model."
      );
    selectedModel = model;
  }

  if (
    inputThinkingLevel !== undefined &&
    !getSupportedThinkingLevels(selectedModel).includes(inputThinkingLevel)
  )
    throw new Error("The configured thinkingLevel is unsupported by the compaction model.");

  // Snapshot selection before routing or generation can change session thinking.
  // Virtual routing owns the physical request, not the persisted selected identity.
  const selection = {
    model: `${selectedModel.provider}/${selectedModel.id}`,
    thinkingLevel: selectedModel.reasoning ? (inputThinkingLevel ?? session.thinkingLevel) : "off"
  } satisfies Pick<SummaryModelEntry, "model" | "thinkingLevel">;
  if (!instructions && reference === undefined && inputThinkingLevel === undefined)
    return { result: await summarize(...args), selection };

  let requestModel = selectedModel;
  let requestThinkingLevel = inputThinkingLevel;

  if (inputThinkingLevel !== undefined && requestModel.api === virtualModelApi) {
    // Apply the selected level to routing; the router owns the physical level.
    const route = await session.modelRuntime.resolveModel(
      requestModel,
      convertToLlm(session.agent.state.messages),
      { reason: "direct", thinkingLevel: inputThinkingLevel, signal: args[3] }
    );
    requestModel = route.model;
    requestThinkingLevel = route.thinkingLevel;
  }

  const hooks = new OwnedHooks();
  const stream = session.agent.streamFunction;
  let active = true;

  try {
    hooks.replace(session.agent, "streamFunction", (model, context, options) => {
      if (!active || options?.signal !== args[3]) return stream(model, context, options);
      const focused = instructions ? focusSplitTurn(context, instructions) : context;
      const configured = { ...options };

      if (requestThinkingLevel !== undefined) {
        delete configured.reasoning;
        if (requestThinkingLevel !== "off") configured.reasoning = requestThinkingLevel;
      }

      if (overrides && reference !== undefined) {
        // The registry owns request-time auth. Never carry session credentials,
        // headers, or environment into the configured provider request.
        delete configured.apiKey;
        delete configured.headers;
        delete configured.env;
        // Registry calls bypass the native session stream's request defaults.
        // Preserve its network policy without borrowing conversation credentials.
        const settings = session.settingsManager;
        const retry = settings.getProviderRetrySettings();
        const idleTimeout = settings.getHttpIdleTimeoutMs();
        const websocketTimeout = settings.getWebSocketConnectTimeoutMs();
        configured.timeoutMs ??= retry.timeoutMs ?? (idleTimeout === 0 ? 2147483647 : idleTimeout);
        configured.maxRetryDelayMs ??= retry.maxRetryDelayMs;
        if (retry.maxRetries !== undefined) configured.maxRetries ??= retry.maxRetries;
        if (websocketTimeout !== undefined)
          configured.websocketConnectTimeoutMs ??= websocketTimeout;

        return overrides.registry.streamSimple(model, focused, {
          ...configured,
          // The session stream normally dispatches this hook after provider auth.
          // Keep that ordering without carrying over conversation headers.
          transformHeaders: (headers) =>
            active && session.extensionRunner.hasHandlers("before_provider_headers")
              ? session.extensionRunner.emitBeforeProviderHeaders(headers)
              : headers
        });
      }

      return stream(model, focused, configured);
    });

    return {
      result: await summarize(args[0], requestModel, args[2], args[3], args[4]),
      selection
    };
  } finally {
    active = false;
    hooks.restore();
  }
}

/** Supply focus to native automatic orchestration, including tool-requested attempts. */
export async function withCompactionInstructions(
  session: NativeSession,
  instructions: string | undefined,
  reason: Parameters<AutoCompaction>[0],
  run: () => Promise<boolean>
) {
  if (instructions === undefined) return run();
  const hooks = new OwnedHooks();
  const runner = session.extensionRunner;
  const emit = runner.emit.bind(runner);
  const summarize = session._runDefaultCompaction.bind(session);
  let active = true;
  const ownsRequest = (signal: AbortSignal | undefined) =>
    active && signal !== undefined && signal === session._autoCompactionAbortController?.signal;

  try {
    const configuredSummary: DefaultCompaction = (
      preparation,
      model,
      focus,
      signal,
      summaryReason
    ) =>
      summarize(
        preparation,
        model,
        summaryReason === reason && ownsRequest(signal) ? instructions : focus,
        signal,
        summaryReason
      );

    hooks.replace(session, "_runDefaultCompaction", configuredSummary);

    const focusedEmit: ExtensionRunner["emit"] = (event) => {
      if (
        event.type === "session_before_compact" &&
        event.reason === reason &&
        ownsRequest(event.signal)
      ) {
        event = { ...event, customInstructions: instructions };
      }

      return emit(event);
    };

    hooks.replace(runner, "emit", focusedEmit);

    return await run();
  } finally {
    active = false;
    hooks.restore();
  }
}
