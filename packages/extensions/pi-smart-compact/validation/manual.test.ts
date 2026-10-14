import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contentText, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
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
import type { CompactSettings } from "../src/config.ts";
import { summaryModelEntryType } from "../src/entry.ts";

const summaryRule = { model: "manual-fixture/summary", thinkingLevel: "low" } as const;
const override = { rules: [{ match: "^manual-fixture/main$", ...summaryRule }] };
const instructions = "Preserve MANUAL_FOCUS_MARKER.";
const fileFocus = "Preserve FILE_FOCUS_MARKER.";
const combinedFocus = "Preserve FILE_FOCUS_MARKER.\n\nPreserve MANUAL_FOCUS_MARKER.";

type SummarySelection = { model: "main" | "summary"; thinkingLevel: "high" | "low" };

const nativeSummary: SummarySelection = { model: "main", thinkingLevel: "high" };
const dedicatedSummary: SummarySelection = { model: "summary", thinkingLevel: "low" };
const lowerThinking: SummarySelection = { model: "main", thinkingLevel: "low" };
const cases: {
  name: string;
  config: CompactSettings;
  manual: SummarySelection;
  automatic: SummarySelection;
  manualFocus?: string;
  automaticFocus?: string;
  error?: RegExp;
  automaticError?: RegExp;
  summaries: number;
}[] = [
  {
    name: "omitted",
    config: override,
    manual: nativeSummary,
    automatic: nativeSummary,
    summaries: 1
  },
  {
    name: "automatic only",
    config: { ...override, applyToAuto: true },
    manual: nativeSummary,
    automatic: dedicatedSummary,
    summaries: 1
  },
  {
    name: "thinking only",
    config: {
      rules: [{ match: "", thinkingLevel: "low" }],
      applyToManual: true,
      applyToAuto: true
    },
    manual: lowerThinking,
    automatic: lowerThinking,
    summaries: 1
  },
  {
    name: "automatic missing model",
    config: { rules: [{ match: "", model: "missing/model" }], applyToAuto: true },
    manual: nativeSummary,
    automatic: nativeSummary,
    automaticError: /model is unavailable/,
    summaries: 1
  },
  {
    name: "instruction file with model opt-ins",
    config: { ...override, instructionsFile: "focus.txt", applyToManual: true, applyToAuto: true },
    manual: dedicatedSummary,
    automatic: dedicatedSummary,
    manualFocus: combinedFocus,
    automaticFocus: fileFocus,
    summaries: 1
  },
  {
    name: "retry",
    config: { ...override, applyToManual: true, instructionsFile: "focus.txt" },
    manual: dedicatedSummary,
    automatic: nativeSummary,
    manualFocus: combinedFocus,
    automaticFocus: fileFocus,
    summaries: 2
  },
  {
    name: "unrelated summary",
    config: {},
    manual: nativeSummary,
    automatic: nativeSummary,
    summaries: 1
  },
  {
    name: "late abort",
    config: {},
    manual: nativeSummary,
    automatic: nativeSummary,
    error: /cancelled|aborted/i,
    summaries: 1
  },
  {
    name: "late abort with retained append",
    config: {},
    manual: nativeSummary,
    automatic: nativeSummary,
    error: /cancelled|aborted/i,
    summaries: 1
  },
  {
    name: "missing model",
    config: { rules: [{ match: "", model: "missing/model" }], applyToManual: true },
    manual: nativeSummary,
    automatic: nativeSummary,
    error: /model is unavailable/,
    summaries: 0
  },
  {
    name: "unsupported thinking",
    config: {
      rules: [{ match: "", ...summaryRule, thinkingLevel: "max" }],
      applyToManual: true
    },
    manual: nativeSummary,
    automatic: nativeSummary,
    error: /thinkingLevel is unsupported/,
    summaries: 0
  }
];

it.each(cases)(
  "SDK manual and automatic compaction: $name",
  async ({
    name,
    config,
    manual,
    automatic,
    manualFocus,
    automaticFocus,
    error,
    automaticError,
    summaries
  }) => {
    const directory = await createValidationWorkspace("pi-manual-compact-");
    const agentDir = join(directory, "agent");
    const cwd = join(directory, "work");
    const settingsPath = join(agentDir, "settings.json");
    const originalSummary: unknown = Reflect.get(AgentSession.prototype, "_runDefaultCompaction");
    let runtime: AgentSessionRuntime | undefined;
    let phase: "manual" | "automatic" = "manual";
    let reloaded = false;
    let automaticReason: "threshold" | "overflow" = "threshold";

    const expectedSelection = () => {
      if (reloaded) return nativeSummary;

      return phase === "manual" ? manual : automatic;
    };

    let summaryRequests = 0;
    let unrelatedRequests = 0;
    const unrelated = new AbortController();
    const errors: unknown[] = [];

    const expectedFocus = () => {
      if (reloaded) return phase === "manual" ? instructions : undefined;

      return phase === "manual" ? (manualFocus ?? instructions) : automaticFocus;
    };

    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    vi.stubEnv("PI_OFFLINE", "1");

    try {
      await writeFile(settingsPath, JSON.stringify({ "ext.pi-smart-compact": config }));
      await writeFile(join(agentDir, "focus.txt"), "Preserve FILE_FOCUS_MARKER.\n");
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
          const selected = expectedSelection();
          assert.equal(model.id, selected.model);
          assert.equal(options.reasoning, selected.thinkingLevel);
          if (selected.model === "summary") assert.equal(options.maxTokens, 128);
          assert.equal(runtime.session.model?.id, "main");
          assert.equal(runtime.session.thinkingLevel, "high");
          assert.equal(runtime.session.isCompacting, true);
          const prompt = context.messages
            .filter((message) => message.role === "user")
            .map((message) => contentText(message.content))
            .join("\n");
          const focus = expectedFocus();
          if (focus) assert.ok(prompt.endsWith(`Additional focus: ${focus}`));
          else assert.ok(!prompt.includes("Additional focus:"));
          const probe = await runtime.session.agent.streamFunction(faux.getModel(), context, {
            ...options,
            signal: unrelated.signal
          });
          assert.equal((await probe.result()).stopReason, "stop");

          if (phase === "manual" && !reloaded && name === "retry" && summaryRequests === 1)
            return fauxAssistantMessage("", { stopReason: "error", errorMessage: "terminated" });

          return fauxAssistantMessage("MANUAL_CHECKPOINT");
        })
      );

      const fixture = (pi: ExtensionAPI) => {
        pi.registerProvider(faux.provider);
        pi.on("before_provider_headers", (event) => {
          event.headers["X-Manual-Fixture"] = "applied";
        });
        pi.on("session_before_compact", async (event) => {
          assert.equal(event.reason, phase === "automatic" ? automaticReason : "manual");
          assert.equal(event.willRetry, phase === "automatic" && automaticReason === "overflow");
          assert.equal(event.customInstructions, expectedFocus());

          if (!reloaded && phase === "manual" && name === "unrelated summary") {
            assert.ok(runtime);
            const summarize: unknown = Reflect.get(runtime.session, "_runDefaultCompaction");
            assert.ok(typeof summarize === "function");
            await Reflect.apply(summarize, runtime.session, [
              event.preparation,
              faux.getModel(),
              instructions,
              unrelated.signal,
              "manual"
            ]);
            assert.ok(
              !runtime.session.sessionManager
                .getBranch()
                .some(
                  (entry) => entry.type === "custom" && entry.customType === summaryModelEntryType
                )
            );
          }
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
      let expectedAppend: unknown = Reflect.get(session.sessionManager, "appendCompaction");

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

      if (name.startsWith("late abort")) {
        const summarize: unknown = Reflect.get(session, "_runDefaultCompaction");
        assert.ok(typeof summarize === "function");
        // Abort after generation resolves but before Pi performs its final abort check.
        Reflect.set(session, "_runDefaultCompaction", async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(summarize, session, args);

          if (name === "late abort with retained append") {
            const append = session.sessionManager.appendCompaction.bind(session.sessionManager);
            const replacement = (...saved: Parameters<SessionManager["appendCompaction"]>) =>
              append(...saved);
            Reflect.set(session.sessionManager, "appendCompaction", replacement);
            expectedAppend = replacement;
          }

          session.abortCompaction();

          return result;
        });
      }

      if (error) {
        await assert.rejects(session.compact(instructions), error);
        if (name.startsWith("late abort")) Reflect.deleteProperty(session, "_runDefaultCompaction");
        assert.equal(session.sessionManager.getLeafId(), before);
      } else {
        assert.equal((await session.compact(instructions)).summary, "MANUAL_CHECKPOINT");
      }

      if (!error) {
        const branch = session.sessionManager.getBranch();
        assert.partialDeepStrictEqual(branch.at(-2), {
          type: "custom",
          customType: "pi-smart-compact.model",
          data: {
            model: `manual-fixture/${manual.model}`,
            thinkingLevel: manual.thinkingLevel,
            trigger: "manual"
          }
        });
        assert.equal(branch.at(-1)?.type, "compaction");
      }

      assert.equal(summaryRequests, summaries);
      assert.equal(Reflect.get(session.sessionManager, "appendCompaction"), expectedAppend);
      assert.equal(session.agent.streamFunction, stream);
      assert.equal(session.isCompacting, false);
      assert.equal(session.isIdle, true);

      const checkAutomatic = async (expectedError?: RegExp) => {
        phase = "automatic";
        const runAutomatic: unknown = Reflect.get(session, "_runAutoCompaction");
        assert.ok(typeof runAutomatic === "function");
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
            const continuation: unknown = await Reflect.apply(runAutomatic, session, [
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
              assert.partialDeepStrictEqual(session.sessionManager.getBranch().at(-2), {
                type: "custom",
                customType: "pi-smart-compact.model",
                data: {
                  model: `manual-fixture/${expectedSelection().model}`,
                  thinkingLevel: expectedSelection().thinkingLevel,
                  trigger: reason
                }
              });
              assert.equal(summaryRequests, requestsBefore + 1);
            }

            assert.equal(Reflect.get(session.sessionManager, "appendCompaction"), expectedAppend);
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

      // Reload removes both routes without changing the conversation model.
      reloaded = true;
      await writeFile(settingsPath, "{}");
      await session.reload();
      phase = "manual";
      seed();
      await session.compact(instructions);
      await checkAutomatic();
      assert.equal(summaryRequests, summaries + (automaticError ? 0 : 2) + 3);
      assert.equal(unrelatedRequests, summaryRequests + (name === "unrelated summary" ? 1 : 0));
      const branch = session.sessionManager.getBranch();
      assert.equal(
        branch.filter(
          (entry) => entry.type === "custom" && entry.customType === summaryModelEntryType
        ).length,
        branch.filter((entry) => entry.type === "compaction" && !entry.fromHook).length
      );
      assert.equal(session.model?.id, "main");
      assert.equal(session.thinkingLevel, "high");
      assert.ok(
        !session.sessionManager.getBranch().some((entry) => entry.type === "custom_message")
      );
      assert.deepEqual(errors, []);
    } finally {
      await runtime?.dispose();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }

    assert.equal(Reflect.get(AgentSession.prototype, "_runDefaultCompaction"), originalSummary);
  },
  20000
);
