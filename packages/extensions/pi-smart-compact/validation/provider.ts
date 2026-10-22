import { appendFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import {
  contentText,
  createProvider,
  fauxAssistantMessage,
  fauxToolCall,
  getCurrentTools,
  Type,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import { AgentSession, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureStream } from "@pi-mono/libs/validation/provider";

export default function offlineFixture(pi: ExtensionAPI) {
  const tracePath = process.env.PI_NATIVE_COMPACTION_TRACE;
  const scenario = process.env.PI_NATIVE_COMPACTION_CASE ?? "success";
  if (!tracePath) throw new Error("Offline fixture requires PI_NATIVE_COMPACTION_TRACE.");
  let session: AgentSession | undefined;
  let mainRequests = 0;
  let summaryRequests = 0;
  let workCalls = 0;
  let idleWaitResolved = false;
  let unsubscribe: (() => void) | undefined;
  let runner: object | undefined;
  let originalDefault: unknown;
  let originalEmit: unknown;
  let originalStream: unknown;
  let hadOwnStream = false;
  let hadOwnDefault = false;
  let hadOwnEmit = false;
  const instructions =
    scenario === "success" ? undefined : "Preserve NATIVE_FOCUS_MARKER and the remaining tests.";
  // The original method is invoked with its original session receiver via apply().
  // oxlint-disable-next-line typescript/unbound-method
  const originalPrompt = AgentSession.prototype.prompt;
  const originalPrepare: unknown = Reflect.get(
    AgentSession.prototype,
    "_compactBeforeNextAssistantResponse"
  );
  const originalPrototypeSummary: unknown = Reflect.get(
    AgentSession.prototype,
    "_runDefaultCompaction"
  );
  const state = () => ({
    idle: session?.isIdle,
    compacting: session?.isCompacting,
    streaming: session?.isStreaming,
    agentStreaming: session?.agent.state.isStreaming,
    instructionPatchRestored:
      session !== undefined &&
      runner !== undefined &&
      Reflect.get(session, "_runDefaultCompaction") === originalDefault &&
      Reflect.get(runner, "emit") === originalEmit &&
      session.agent.streamFunction === originalStream &&
      Object.hasOwn(session.agent, "streamFunction") === hadOwnStream &&
      Object.hasOwn(session, "_runDefaultCompaction") === hadOwnDefault &&
      Object.hasOwn(runner, "emit") === hadOwnEmit,
    idleWaitResolved
  });

  const trace = (type: string, details: Record<string, unknown> = {}) => {
    appendFileSync(tracePath, `${JSON.stringify({ type, ...state(), ...details })}\n`);
  };

  AgentSession.prototype.prompt = async function (...args) {
    session = this;
    runner = this.extensionRunner;
    originalDefault = Reflect.get(this, "_runDefaultCompaction");
    originalEmit = Reflect.get(runner, "emit");
    originalStream = this.agent.streamFunction;
    hadOwnStream = Object.hasOwn(this.agent, "streamFunction");
    hadOwnDefault = Object.hasOwn(this, "_runDefaultCompaction");
    hadOwnEmit = Object.hasOwn(runner, "emit");

    if (scenario === "instructions-history") {
      this.sessionManager.appendMessage({
        role: "user",
        content: "Previously completed work.",
        timestamp: Date.now()
      });
      this.sessionManager.appendMessage(fauxAssistantMessage("Previous task completed."));
      this.agent.state.messages = this.sessionManager.buildSessionProjection().messages;
    }

    if (scenario === "manual-split") {
      this.sessionManager.appendMessage({
        role: "user",
        content: "OLD_FIXTURE_PAYLOAD ".repeat(1500),
        timestamp: Date.now()
      });
      this.sessionManager.appendMessage(fauxAssistantMessage("RECENT_PROGRESS ".repeat(100)));
    }

    unsubscribe ??= this.subscribe((event) => {
      if (event.type === "message_update") return;
      const compaction =
        event.type === "compaction_start" ||
        event.type === "compaction_end" ||
        (event.type === "summarization_retry_attempt_start" && event.source === "compaction");
      trace(`public:${event.type}`, compaction ? { reason: event.reason } : {});

      if (event.type === "compaction_start") {
        void this.waitForIdle().then(() => {
          idleWaitResolved = true;
          trace("wait:idle");
        });
      }
    });

    return originalPrompt.apply(this, args);
  };

  pi.on("before_provider_headers", (event) => {
    trace("hook:headers", { provider: event.headers["X-Fixture-Provider"] });
    event.headers["X-Fixture-Hook"] = "applied";
    delete event.headers["X-Fixture-Remove"];
  });
  pi.on("session_before_compact", async (event, ctx) => {
    trace("hook:before", {
      ctxIdle: ctx.isIdle(),
      reason: event.reason,
      customInstructions: event.customInstructions,
      isSplitTurn: event.preparation.isSplitTurn,
      settings: event.preparation.settings,
      branch: event.branchEntries.map((entry) =>
        entry.type === "message"
          ? {
              type: entry.type,
              role: entry.message.role,
              toolName: entry.message.role === "toolResult" ? entry.message.toolName : undefined
            }
          : { type: entry.type }
      )
    });
    await delay(10);
    trace("hook:before:awaited", { ctxIdle: ctx.isIdle() });
    if (scenario === "cancel") return { cancel: true };

    return undefined;
  });
  pi.on("session_compact", (event, ctx) => {
    trace("hook:success", {
      ctxIdle: ctx.isIdle(),
      fromExtension: event.fromExtension,
      reason: event.reason
    });
  });
  pi.on("session_compact_failed", (event, ctx) => {
    trace("hook:failed", {
      ctxIdle: ctx.isIdle(),
      aborted: event.aborted,
      reason: event.reason,
      errorMessage: event.errorMessage
    });
  });
  pi.on("agent_settled", (_event, ctx) => trace("hook:settled", { ctxIdle: ctx.isIdle() }));
  pi.on("session_shutdown", () => {
    originalDefault = originalPrototypeSummary;
    trace("hook:shutdown", {
      patchRestored:
        Reflect.get(AgentSession.prototype, "_compactBeforeNextAssistantResponse") ===
          originalPrepare &&
        Reflect.get(AgentSession.prototype, "_runDefaultCompaction") === originalPrototypeSummary
    });
    AgentSession.prototype.prompt = originalPrompt;
    unsubscribe?.();
  });

  pi.registerCommand("fixture_manual_compact", {
    description: "Exercise the native manual compaction entry point offline.",
    handler: async () => {
      if (!session) throw new Error("Missing fixture session");
      await session.compact(instructions);
      trace("fixture:entry");
    }
  });
  pi.registerCommand("fixture_auto_compact", {
    description: "Exercise the native threshold compaction entry point offline.",
    handler: async () => {
      if (!session) throw new Error("Missing fixture session");
      const automatic: unknown = Reflect.get(session, "_runAutoCompaction");
      if (typeof automatic !== "function") throw new Error("Missing automatic compaction");
      await Reflect.apply(automatic, session, ["threshold", false]);
      trace("fixture:entry");
    }
  });

  const stream: ProviderStreams["streamSimple"] = (model, context, options = {}) => {
    const requestDetails = {
      provider: model.provider,
      model: model.id,
      reasoning: options.reasoning,
      apiKey: options.apiKey,
      headers: options.headers,
      authEnv: options.env?.PI_COMPACTION_FIXTURE_AUTH,
      baseUrl: model.baseUrl,
      requestPolicy: {
        timeoutMs: options.timeoutMs,
        websocketConnectTimeoutMs: options.websocketConnectTimeoutMs,
        maxRetries: options.maxRetries,
        maxRetryDelayMs: options.maxRetryDelayMs
      },
      sessionModel: session?.model?.id,
      sessionThinking: session?.thinkingLevel
    };

    return createFixtureStream({
      model,
      signal: options.signal,
      async run({ message, events, text }) {
        const tools = getCurrentTools(context.messages);

        if (tools.length === 0) {
          const prompt = context.messages
            .filter((entry) => entry.role === "user")
            .map((entry) => contentText(entry.content))
            .join("\n");
          summaryRequests++;
          trace("provider:summary", {
            ...requestDetails,
            summaryKind: prompt.includes("# Instructions\nThe messages above")
              ? "prefix"
              : "history",
            additionalFocusCount: prompt.split("Additional focus:").length - 1,
            focus: /\n\nAdditional focus: ([\s\S]*)$/u.exec(prompt)?.[1]
          });
          if (scenario === "failure") throw new Error("Offline summary failure");
          if (scenario === "retry" && summaryRequests === 1) throw new Error("terminated");

          if (["abort", "escape"].includes(scenario)) {
            const timer = setTimeout(() => {
              if (scenario === "escape") session?.abortCompaction();
              else void session?.abort();
            }, 20);

            try {
              await delay(1000, undefined, { signal: options.signal });
            } finally {
              clearTimeout(timer);
            }
          }

          await delay(25, undefined, { signal: options.signal });
          trace("provider:summary:awaited");
          text("NATIVE_FIXTURE_CHECKPOINT: Earlier work is complete. Finish the original task.");
          message.usage.input = 120;
          message.usage.output = 20;
          message.usage.totalTokens = 140;

          return "stop";
        }

        mainRequests++;
        const serialized = JSON.stringify(context.messages);
        trace("provider:main", {
          request: mainRequests,
          ...requestDetails,
          hasCheckpoint: serialized.includes("NATIVE_FIXTURE_CHECKPOINT"),
          hasOldPayload: serialized.includes("OLD_FIXTURE_PAYLOAD"),
          userMessages: context.messages.flatMap((entry) =>
            entry.role === "user" ? [contentText(entry.content)] : []
          )
        });
        let calls: string[] = [];

        if (mainRequests === 1) calls = ["fixture_work"];
        else if (mainRequests === 2) calls = ["compact", "fixture_work"];

        if (calls.length === 0) {
          text("TASK_FINISHED");

          return "stop";
        }

        for (const [index, name] of calls.entries()) {
          const arguments_ = name === "compact" && instructions ? { instructions } : {};
          const call = fauxToolCall(name, arguments_, { id: `call-${mainRequests}-${index}` });
          const contentIndex = message.content.length;
          message.content.push(call);
          events.push({ type: "toolcall_start", contentIndex, partial: message });
          events.push({
            type: "toolcall_delta",
            contentIndex,
            delta: JSON.stringify(arguments_),
            partial: message
          });
          events.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: message });
        }

        return "toolUse";
      }
    });
  };

  for (const dedicated of [false, true]) {
    const provider = dedicated ? "summary-compaction-fixture" : "native-compaction-fixture";
    pi.registerProvider(
      createProvider({
        id: provider,
        auth: {
          apiKey: {
            name: "Offline fixture",
            resolve: async () => {
              if (dedicated && scenario === "auth-failure")
                throw new Error("Offline summary authentication failed");

              return {
                auth: {
                  apiKey: provider,
                  headers: { "X-Fixture-Provider": provider, "X-Fixture-Remove": "remove" },
                  baseUrl: `http://${provider}.invalid`
                },
                env: { PI_COMPACTION_FIXTURE_AUTH: provider },
                source: "fixture"
              };
            }
          }
        },
        models: [
          {
            id: dedicated ? "nested/summary" : "scripted",
            name: "Offline native compaction fixture",
            api: provider,
            provider,
            baseUrl: "http://localhost.invalid",
            reasoning: true,
            input: ["text"],
            contextWindow: 200000,
            maxTokens: 4096,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          }
        ],
        api: { stream, streamSimple: stream }
      })
    );
  }

  pi.registerTool({
    name: "fixture_work",
    label: "Fixture work",
    description: "Produce offline test data.",
    parameters: Type.Object({}),
    async execute() {
      workCalls++;
      await delay(15);

      return {
        content: [
          {
            type: "text",
            text: workCalls === 1 ? "OLD_FIXTURE_PAYLOAD ".repeat(1500) : "Recent work completed."
          }
        ],
        details: undefined
      };
    }
  });
}
