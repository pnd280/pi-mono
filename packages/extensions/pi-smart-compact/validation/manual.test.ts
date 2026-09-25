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
  summaries: number;
}[] = [
  { name: "omitted", config: override, summaries: 1 },
  { name: "disabled", config: { ...override, applyToManual: false }, summaries: 1 },
  { name: "enabled", config: { ...override, applyToManual: true }, summaries: 1 },
  { name: "thinking only", config: { thinkingLevel: "low", applyToManual: true }, summaries: 1 },
  { name: "native defaults", config: { applyToManual: true }, summaries: 1 },
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
  "manual SDK compaction: $name",
  async ({ name, config, error, summaries }) => {
    const directory = await createValidationWorkspace("pi-manual-compact-");
    const agentDir = join(directory, "agent");
    const cwd = join(directory, "work");
    const settingsPath = join(agentDir, "settings.json");
    const originalSummary: unknown = Reflect.get(AgentSession.prototype, "_runDefaultCompaction");
    let runtime: AgentSessionRuntime | undefined;
    let restoreStream: (() => void) | undefined;
    let phase: "manual" | "automatic" | "reloaded" = "manual";
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
        Array.from({ length: 12 }, () => async (context, options, _state, model) => {
          assert.ok(runtime);
          assert.equal(options?.headers?.["X-Manual-Fixture"], "applied");

          if (options.signal === unrelated.signal) {
            unrelatedRequests++;
            assert.equal(model.id, "main");

            return fauxAssistantMessage("Unrelated response");
          }

          summaryRequests++;
          const selected = phase === "manual" && config.applyToManual;
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

          if (phase === "manual") {
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
          assert.equal(event.reason, phase === "automatic" ? "threshold" : "manual");
          assert.equal(event.customInstructions, phase === "automatic" ? undefined : instructions);
          if (phase === "manual" && name === "hook cancellation") return { cancel: true };
          if (phase === "manual" && name === "custom summary")
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
      restoreStream?.();
      restoreStream = undefined;
      assert.equal(session.agent.streamFunction, stream);
      assert.equal(session.isCompacting, false);
      assert.equal(session.isIdle, true);

      // Automatic compaction remains native, including after failed manual attempts.
      phase = "automatic";
      seed();
      const automatic: unknown = Reflect.get(session, "_runAutoCompaction");
      assert.ok(typeof automatic === "function");
      await Reflect.apply(automatic, session, ["threshold", false]);
      assert.equal(summaryRequests, summaries + 1);
      assert.equal(session.agent.streamFunction, stream);

      // Reload removes the manual override without changing the conversation model.
      phase = "reloaded";
      await writeFile(settingsPath, "{}");
      await session.reload();
      seed();
      await session.compact(instructions);
      assert.equal(summaryRequests, summaries + 2);
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
