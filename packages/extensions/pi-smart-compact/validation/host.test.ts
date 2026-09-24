import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  contentText,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
  Type,
  type TranscriptContext
} from "@earendil-works/pi-ai";
import {
  AgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
  SettingsManager,
  type AgentSessionRuntime,
  type ContextUsage,
  type CreateAgentSessionRuntimeFactory,
  type ExtensionAPI
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { it, vi } from "vite-plus/test";

import smartCompact from "../index.ts";

function withoutFocus(context: TranscriptContext, focus: string): TranscriptContext {
  return {
    ...context,
    messages: context.messages.map((message) => {
      if (message.role !== "user" || typeof message.content === "string") return message;

      return {
        ...message,
        content: message.content.map((block) =>
          block.type === "text" ? { ...block, text: block.text.replace(focus, "") } : block
        )
      };
    })
  };
}

it("continues through native SDK compaction, session replacement, and extension reload", async () => {
  const directory = await createValidationWorkspace("pi-smart-compact-host-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  const original: unknown = Reflect.get(
    AgentSession.prototype,
    "_compactBeforeNextAssistantResponse"
  );
  let runtime: AgentSessionRuntime | undefined;
  let mainRequests = 0;
  let workCalls = 0;
  let inspections = 0;
  let contextUsage: ContextUsage | undefined;
  const usageCases: (ContextUsage | undefined)[] = [
    { tokens: 50001, contextWindow: 200000, percent: 25.0005 },
    { tokens: null, contextWindow: 200000, percent: null },
    undefined
  ];
  const summaries: string[] = [];
  const errors: unknown[] = [];
  const instructions = "Keep HOST_FOCUS_MARKER and unfinished tests.";
  const unrelated = new AbortController();
  const unrelatedRequests: string[] = [];
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");

  try {
    const faux = fauxProvider({ provider: "smart-compact-fixture", models: [{ id: "scripted" }] });
    faux.setResponses(
      Array.from({ length: 20 }, () => async (context, options, _state, model) => {
        if (options?.signal === unrelated.signal) {
          unrelatedRequests.push(JSON.stringify(context.messages));

          return fauxAssistantMessage("Unrelated summary");
        }

        if (getCurrentTools(context.messages).length === 0) {
          assert.equal(runtime?.session.isCompacting, true);
          assert.equal(runtime.session.isIdle, false);
          summaries.push(JSON.stringify(context.messages));
          const probe = await runtime.session.agent.streamFunction(
            model,
            withoutFocus(context, `\n\nAdditional focus: ${instructions}`),
            { ...options, signal: unrelated.signal }
          );
          assert.equal((await probe.result()).stopReason, "stop");

          return fauxAssistantMessage("HOST_CHECKPOINT: finish the task.");
        }

        mainRequests++;
        const outcomes = context.messages.flatMap((message) => {
          if (message.role !== "user") return [];
          const content = contentText(message.content);

          return content.startsWith("Compaction completed.") ? [content] : [];
        });
        assert.equal(outcomes.length, 0);
        if (mainRequests === 1)
          return fauxAssistantMessage(
            [fauxToolCall("context_window", {}), fauxToolCall("fixture_work", {})],
            { stopReason: "toolUse" }
          );
        if (mainRequests === 2)
          return fauxAssistantMessage(
            [fauxToolCall("compact", { instructions }), fauxToolCall("fixture_work", {})],
            { stopReason: "toolUse" }
          );
        assert.ok(JSON.stringify(context.messages).includes("HOST_CHECKPOINT"));

        return fauxAssistantMessage("HOST_FINISHED");
      })
    );

    const fixture = (pi: ExtensionAPI) => {
      pi.registerProvider(faux.provider);
      pi.on("tool_result", (event) => {
        if (event.toolName !== "context_window") return;
        inspections++;
        assert.equal(event.isError, false);
        assert.equal(event.details, contextUsage);
        assert.deepEqual(event.content, [
          {
            type: "text",
            text:
              contextUsage === undefined
                ? "Context usage unavailable."
                : JSON.stringify(contextUsage)
          }
        ]);
      });
      pi.registerTool({
        name: "fixture_work",
        label: "Fixture work",
        description: "Fixture work",
        parameters: Type.Object({}),
        async execute() {
          workCalls++;

          return {
            content: [
              { type: "text", text: workCalls === 1 ? "OLD_WORK ".repeat(3000) : "Recent work." }
            ],
            details: undefined
          };
        }
      });
    };

    const createRuntime: CreateAgentSessionRuntimeFactory = async ({
      cwd: sessionCwd,
      sessionManager,
      sessionStartEvent
    }) => {
      const services = await createAgentSessionServices({
        cwd: sessionCwd,
        agentDir,
        settingsManager: SettingsManager.inMemory({
          defaultProvider: "smart-compact-fixture",
          defaultModel: "scripted",
          defaultThinkingLevel: "off",
          compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 },
          retry: { enabled: false }
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
          thinkingLevel: "off",
          ...(sessionStartEvent ? { sessionStartEvent } : {})
        })),
        services,
        diagnostics: services.diagnostics
      };
    };

    runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir,
      sessionManager: SessionManager.inMemory(cwd)
    });

    const bind = async (session: AgentSession) => {
      await session.bindExtensions({ mode: "print", onError: (error) => errors.push(error) });
      assert.ok(session.getActiveToolNames().includes("compact"));
      assert.ok(session.getActiveToolNames().includes("context_window"));
    };

    runtime.setRebindSession(bind);
    await bind(runtime.session);

    for (const [run, usage] of usageCases.entries()) {
      mainRequests = 0;
      workCalls = 0;
      contextUsage = usage;
      const getContextUsage = vi
        .spyOn(runtime.session, "getContextUsage")
        .mockReturnValue(contextUsage);
      await runtime.session.prompt("Inspect context usage, do the work, compact, and finish.");
      await runtime.session.waitForIdle();
      getContextUsage.mockRestore();
      assert.equal(mainRequests, 3);
      assert.equal(runtime.session.isIdle, true);
      assert.equal(runtime.session.isCompacting, false);
      assert.equal(
        runtime.session.sessionManager.getBranch().filter((entry) => entry.type === "compaction")
          .length,
        1
      );
      assert.equal(
        runtime.session.sessionManager
          .getBranch()
          .filter(
            (entry) =>
              entry.type === "custom_message" && entry.customType === "smart-compaction-result"
          ).length,
        0
      );
      await runtime.session.prompt("What was the compaction outcome? Do not call any tools.");
      assert.equal(mainRequests, 4);
      if (run < 2) await runtime.newSession();
      if (run === 1) await runtime.session.reload();
    }

    assert.equal(inspections, usageCases.length);
    assert.equal(summaries.length, 3);
    assert.equal(unrelatedRequests.length, 3);
    for (const request of unrelatedRequests) assert.ok(!request.includes("Additional focus:"));
    for (const request of summaries)
      assert.equal(request.split(`Additional focus: ${instructions}`).length - 1, 1);
    assert.deepEqual(errors, []);
  } finally {
    await runtime?.dispose();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }

  assert.equal(
    Reflect.get(AgentSession.prototype, "_compactBeforeNextAssistantResponse"),
    original
  );
}, 20000);
