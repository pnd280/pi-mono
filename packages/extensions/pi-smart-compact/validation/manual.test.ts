import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  AgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type ExtensionAPI
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { it, vi } from "vite-plus/test";

import smartCompact from "../index.ts";
import type { CompactConfig } from "../src/config.ts";

const override = { model: "manual-fixture/summary", thinkingLevel: "low" } as const;
const cases: {
  name: string;
  config: CompactConfig;
  error?: RegExp;
  automaticError?: RegExp;
  summaries: number;
}[] = [
  { name: "omitted", config: override, summaries: 1 },
  { name: "disabled", config: { ...override, applyToManual: false }, summaries: 1 },
  { name: "enabled", config: { ...override, applyToManual: true }, summaries: 1 },
  { name: "automatic only", config: { ...override, applyToAuto: true }, summaries: 1 },
  {
    name: "automatic disabled",
    config: { ...override, applyToManual: true, applyToAuto: false },
    summaries: 1
  },
  {
    name: "both enabled",
    config: { ...override, applyToManual: true, applyToAuto: true },
    summaries: 1
  },
  {
    name: "thinking only",
    config: { thinkingLevel: "low", applyToManual: true, applyToAuto: true },
    summaries: 1
  },
  {
    name: "native defaults",
    config: { applyToManual: true, applyToAuto: true },
    summaries: 1
  },
  {
    name: "automatic missing model",
    config: { model: "missing/model", applyToAuto: true },
    automaticError: /model is unavailable/,
    summaries: 1
  },
  { name: "retry", config: { ...override, applyToManual: true }, summaries: 2 },
  {
    name: "missing model",
    config: { model: "missing/model", applyToManual: true },
    error: /model is unavailable/,
    summaries: 0
  },
  {
    name: "unsupported thinking",
    config: { ...override, thinkingLevel: "max", applyToManual: true },
    error: /thinkingLevel is unsupported/,
    summaries: 0
  },
  {
    name: "failure",
    config: { ...override, applyToManual: true },
    error: /Manual summary failure/,
    summaries: 1
  },
  {
    name: "abort",
    config: { ...override, applyToManual: true },
    error: /cancelled|aborted/i,
    summaries: 1
  },
  {
    name: "hook cancellation",
    config: { model: "missing/model", applyToManual: true },
    error: /cancelled/,
    summaries: 0
  },
  {
    name: "custom summary",
    config: { model: "missing/model", applyToManual: true },
    summaries: 0
  }
];

it.each(cases)(
  "SDK manual and automatic compaction: $name",
  async ({ name, config, error, automaticError, summaries }) => {
    const directory = await createValidationWorkspace("pi-manual-compact-");
    const agentDir = join(directory, "agent");
    const cwd = join(directory, "work");
    const settingsPath = join(agentDir, "settings.json");
    const originalSummary: unknown = Reflect.get(AgentSession.prototype, "_runDefaultCompaction");
    let runtime: AgentSessionRuntime | undefined;
    let restoreStream: (() => void) | undefined;
    let phase: "manual" | "automatic" = "manual";
    let reloaded = false;
    let automaticReason: "threshold" | "overflow" = "threshold";
    const routed = () =>
      !reloaded &&
      ((phase === "manual" && config.applyToManual) ||
        (phase === "automatic" && config.applyToAuto));
    let summaryRequests = 0;
    let unrelatedRequests = 0;
    const unrelated = new AbortController();
    const errors: unknown[] = [];
    const instructions = "Preserve MANUAL_FOCUS_MARKER.";
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    vi.stubEnv("PI_OFFLINE", "1");

    try {
      await writeFile(settingsPath, JSON.stringify({ "ext.pi-smart-compact": config }));
      const faux = fauxProvider({
        provider: "manual-fixture",
        models: [
          { id: "main", reasoning: true },
          { id: "summary", reasoning: true, maxTokens: 128 }
        ]
      });
      faux.setResponses(
        Array.from({ length: 16 }, () => async (context, options, _state, model) => {
          assert.ok(runtime);
          assert.equal(options?.headers?.["X-Manual-Fixture"], "applied");

          if (options.signal === unrelated.signal) {
            unrelatedRequests++;
            assert.equal(model.id, "main");

            return fauxAssistantMessage("Unrelated response");
          }

          summaryRequests++;
          const selected = routed();
          assert.equal(model.id, selected && config.model ? "summary" : "main");
          assert.equal(options.reasoning, (selected && config.thinkingLevel) || "high");
          if (selected && config.model) assert.equal(options.maxTokens, 128);
          assert.equal(runtime.session.model?.id, "main");
          assert.equal(runtime.session.thinkingLevel, "high");
          assert.equal(runtime.session.isCompacting, true);
          if (phase !== "automatic")
            assert.ok(JSON.stringify(context.messages).includes(instructions));
          const probe = await runtime.session.agent.streamFunction(faux.getModel(), context, {
            ...options,
            signal: unrelated.signal
          });
          assert.equal((await probe.result()).stopReason, "stop");

          if (phase === "manual" && !reloaded) {
            if (name === "abort") runtime.session.abortCompaction();
            if (name === "failure" || (name === "retry" && summaryRequests === 1))
              return fauxAssistantMessage("", {
                stopReason: "error",
                errorMessage: name === "retry" ? "terminated" : "Manual summary failure"
              });
          }

          return fauxAssistantMessage("MANUAL_CHECKPOINT");
        })
      );

      const fixture = (pi: ExtensionAPI) => {
        pi.registerProvider(faux.provider);
        pi.on("before_provider_headers", (event) => {
          event.headers["X-Manual-Fixture"] = "applied";
        });
        pi.on("session_before_compact", (event) => {
          assert.equal(event.reason, phase === "automatic" ? automaticReason : "manual");
          assert.equal(event.willRetry, phase === "automatic" && automaticReason === "overflow");
          assert.equal(event.customInstructions, phase === "automatic" ? undefined : instructions);
          if (!reloaded && phase === "manual" && name === "hook cancellation")
            return { cancel: true };
          if (!reloaded && phase === "manual" && name === "custom summary")
            return {
              compaction: {
                summary: "CUSTOM_CHECKPOINT",
                firstKeptEntryId: event.preparation.firstKeptEntryId,
                tokensBefore: event.preparation.tokensBefore
              }
            };

          return undefined;
        });
      };

      runtime = await createAgentSessionRuntime(
        async ({ sessionManager }) => {
          const services = await createAgentSessionServices({
            cwd,
            agentDir,
            settingsManager: SettingsManager.inMemory({
              compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 },
              retry: { enabled: name === "retry", maxRetries: 1, baseDelayMs: 1 }
            }),
            resourceLoaderOptions: {
              noExtensions: true,
              noSkills: true,
              noThemes: true,
              noContextFiles: true,
              noPromptTemplates: true,
              extensionFactories: [smartCompact, fixture]
            }
          });

          return {
            ...(await createAgentSessionFromServices({
              services,
              sessionManager,
              model: faux.getModel(),
              thinkingLevel: "high"
            })),
            services,
            diagnostics: services.diagnostics
          };
        },
        { cwd, agentDir, sessionManager: SessionManager.inMemory(cwd) }
      );
      await runtime.session.bindExtensions({
        mode: "print",
        onError: (event) => errors.push(event)
      });
      const session = runtime.session;
      const stream = session.agent.streamFunction;

      if (name === "native defaults") {
        const descriptor = Object.getOwnPropertyDescriptor(session.agent, "streamFunction");
        assert.ok(descriptor);
        Object.defineProperty(session.agent, "streamFunction", { ...descriptor, writable: false });
        restoreStream = () => Object.defineProperty(session.agent, "streamFunction", descriptor);
      }

      const seed = () => {
        session.sessionManager.appendMessage({
          role: "user",
          content: "OLD_MANUAL_PAYLOAD ".repeat(1000),
          timestamp: Date.now()
        });
        session.sessionManager.appendMessage(fauxAssistantMessage("Finished work."));
        session.sessionManager.appendMessage({
          role: "user",
          content: "CURRENT_REQUEST ".repeat(100),
          timestamp: Date.now()
        });
      };

      seed();
      const before = session.sessionManager.getLeafId();

      if (error) {
        await assert.rejects(session.compact(instructions), error);
        assert.equal(session.sessionManager.getLeafId(), before);
      } else {
        const result = await session.compact(instructions);
        assert.equal(
          result.summary,
          name === "custom summary" ? "CUSTOM_CHECKPOINT" : "MANUAL_CHECKPOINT"
        );
      }

      assert.equal(summaryRequests, summaries);
      assert.equal(session.agent.streamFunction, stream);
      assert.equal(session.isCompacting, false);
      assert.equal(session.isIdle, true);

      const checkAutomatic = async (expectedError?: RegExp) => {
        phase = "automatic";
        const automatic: unknown = Reflect.get(session, "_runAutoCompaction");
        assert.ok(typeof automatic === "function");
        const ends: Extract<AgentSessionEvent, { type: "compaction_end" }>[] = [];
        const unsubscribe = session.subscribe((event) => {
          if (event.type === "compaction_end") ends.push(event);
        });

        try {
          for (const reason of ["threshold", "overflow"] as const) {
            automaticReason = reason;
            seed();
            const leaf = session.sessionManager.getLeafId();
            const requestsBefore = summaryRequests;
            const eventsBefore = ends.length;
            const willRetry = reason === "overflow";
            const continuation: unknown = await Reflect.apply(automatic, session, [
              reason,
              willRetry
            ]);
            assert.equal(continuation, !expectedError && willRetry);
            assert.equal(ends.length, eventsBefore + 1);
            const end = ends.at(-1);
            assert.ok(end);
            assert.equal(end.reason, reason);
            assert.equal(end.aborted, false);
            assert.equal(end.willRetry, !expectedError && willRetry);

            if (expectedError) {
              assert.match(end.errorMessage ?? "", expectedError);
              assert.equal(end.result, undefined);
              assert.equal(session.sessionManager.getLeafId(), leaf);
              assert.equal(summaryRequests, requestsBefore);
            } else {
              assert.equal(end.errorMessage, undefined);
              assert.equal(end.result?.summary, "MANUAL_CHECKPOINT");
              assert.partialDeepStrictEqual(session.sessionManager.getBranch().at(-1), {
                type: "compaction",
                summary: "MANUAL_CHECKPOINT"
              });
              assert.equal(summaryRequests, requestsBefore + 1);
            }

            assert.equal(session.agent.streamFunction, stream);
            assert.equal(session.isCompacting, false);
            assert.equal(session.isIdle, true);
          }
        } finally {
          unsubscribe();
        }
      };

      // Automatic compaction follows applyToAuto independently of manual attempts.
      await checkAutomatic(automaticError);
      restoreStream?.();
      restoreStream = undefined;

      // Reload removes both routes without changing the conversation model.
      reloaded = true;
      await writeFile(settingsPath, "{}");
      await session.reload();
      phase = "manual";
      seed();
      await session.compact(instructions);
      await checkAutomatic();
      assert.equal(summaryRequests, summaries + (automaticError ? 0 : 2) + 3);
      assert.equal(unrelatedRequests, summaryRequests);
      assert.equal(session.model?.id, "main");
      assert.equal(session.thinkingLevel, "high");
      assert.ok(
        !session.sessionManager.getBranch().some((entry) => entry.type === "custom_message")
      );
      assert.deepEqual(errors, []);
    } finally {
      restoreStream?.();
      await runtime?.dispose();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }

    assert.equal(Reflect.get(AgentSession.prototype, "_runDefaultCompaction"), originalSummary);
  },
  20000
);
