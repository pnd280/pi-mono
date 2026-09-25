import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionRunner, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DefaultCompaction, NativeSession } from "./compatibility.ts";
import type { CompactConfig } from "./config.ts";
import { focusSplitTurn } from "./instructions.ts";

export type CompactionModelOptions = {
  config: CompactConfig;
  registry: Pick<ModelRegistry, "find" | "streamSimple">;
};

export async function summarizeWithOverrides(
  session: NativeSession,
  summarize: DefaultCompaction,
  args: Parameters<DefaultCompaction>,
  instructions: string | undefined,
  selection: CompactionModelOptions | undefined
) {
  if (instructions !== undefined) args[4] = instructions;
  const reference = selection?.config.model;
  const thinkingLevel = selection?.config.thinkingLevel;

  if (selection && reference !== undefined) {
    const slash = reference.indexOf("/");
    const model = selection.registry.find(reference.slice(0, slash), reference.slice(slash + 1));
    if (!model)
      throw new Error(
        "The configured compaction model is unavailable. Check ext.pi-smart-compact.model."
      );
    args[1] = model;
    // The registry resolves the selected provider's auth at request time. Never
    // pass the conversation provider's credentials, headers, or environment to it.
    args[2] = undefined;
    args[3] = undefined;
    args[6] = undefined;
  }

  if (thinkingLevel !== undefined && !getSupportedThinkingLevels(args[1]).includes(thinkingLevel))
    throw new Error("The configured thinkingLevel is unsupported by the compaction model.");

  const hooks = new OwnedHooks();
  const stream = session.agent.streamFunction;
  let active = true;

  try {
    hooks.replace(session.agent, "streamFunction", (model, context, options) => {
      if (!active || options?.signal !== args[5]) return stream(model, context, options);
      const focused = instructions ? focusSplitTurn(context, instructions) : context;
      const configured = { ...options };

      if (thinkingLevel !== undefined) {
        delete configured.reasoning;
        if (thinkingLevel !== "off") configured.reasoning = thinkingLevel;
      }

      if (selection && reference !== undefined) {
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

        return selection.registry.streamSimple(model, focused, {
          ...configured,
          // The session stream normally dispatches this hook after provider auth.
          // Keep that ordering without carrying over conversation headers.
          transformHeaders: (headers) =>
            active && session._extensionRunner.hasHandlers("before_provider_headers")
              ? session._extensionRunner.emitBeforeProviderHeaders(headers)
              : headers
        });
      }

      return stream(model, focused, configured);
    });

    return await summarize(...args);
  } finally {
    active = false;
    hooks.restore();
  }
}

export async function runWithOverrides(
  session: NativeSession,
  instructions?: string,
  selection?: CompactionModelOptions
) {
  const hooks = new OwnedHooks();
  const runner = session._extensionRunner;
  const emit = runner.emit.bind(runner);
  const summarize = session._runDefaultCompaction.bind(session);
  let active = true;
  const ownsRequest = (signal: AbortSignal | undefined) =>
    active && signal !== undefined && signal === session._autoCompactionAbortController?.signal;

  try {
    const configuredSummary: DefaultCompaction = (...args) => {
      if (args[7] === "manual" && ownsRequest(args[5])) {
        return summarizeWithOverrides(session, summarize, args, instructions, selection);
      }

      return summarize(...args);
    };

    hooks.replace(session, "_runDefaultCompaction", configuredSummary);

    if (instructions !== undefined) {
      const focusedEmit: ExtensionRunner["emit"] = (event) => {
        if (
          event.type === "session_before_compact" &&
          event.reason === "manual" &&
          ownsRequest(event.signal)
        ) {
          event = { ...event, customInstructions: instructions };
        }

        return emit(event);
      };

      hooks.replace(runner, "emit", focusedEmit);
    }

    await session._runAutoCompaction("manual", false);
  } finally {
    active = false;
    hooks.restore();
  }
}
