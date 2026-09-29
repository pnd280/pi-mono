import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { it } from "vite-plus/test";
import { z } from "zod";

import type { CompactConfig } from "../src/config.ts";
import { summaryModelEntryType } from "../src/entry.ts";
import { compactionResultType } from "../src/outcome.ts";

const traceSchema = z.object({
  type: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  reasoning: z.string().optional(),
  apiKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  authEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().optional(),
  requestPolicy: z
    .object({
      timeoutMs: z.number().optional(),
      websocketConnectTimeoutMs: z.number().optional(),
      maxRetries: z.number().optional(),
      maxRetryDelayMs: z.number().optional()
    })
    .optional(),
  sessionModel: z.string().optional(),
  sessionThinking: z.string().optional(),
  idle: z.boolean().optional(),
  compacting: z.boolean().optional(),
  streaming: z.boolean().optional(),
  agentStreaming: z.boolean().optional(),
  idleWaitResolved: z.boolean().optional(),
  ctxIdle: z.boolean().optional(),
  patchRestored: z.boolean().optional(),
  fromExtension: z.boolean().optional(),
  aborted: z.boolean().optional(),
  reason: z.string().optional(),
  customInstructions: z.string().optional(),
  isSplitTurn: z.boolean().optional(),
  historyMessages: z.number().optional(),
  prefixMessages: z.number().optional(),
  summaryKind: z.enum(["history", "prefix"]).optional(),
  additionalFocusCount: z.number().optional(),
  focus: z.string().optional(),
  cacheRetention: z.string().optional(),
  instructionPatchRestored: z.boolean().optional(),
  request: z.number().optional(),
  hasCheckpoint: z.boolean().optional(),
  hasOldPayload: z.boolean().optional(),
  userMessages: z.array(z.string()).optional(),
  settings: z
    .object({ enabled: z.boolean(), keepRecentTokens: z.number(), reserveTokens: z.number() })
    .optional(),
  branch: z
    .array(
      z.object({ type: z.string(), role: z.string().optional(), toolName: z.string().optional() })
    )
    .optional()
});

type Trace = z.infer<typeof traceSchema>[];

function checkCompactionLifecycle(trace: Trace) {
  const reasonEvents = new Set([
    "public:compaction_start",
    "public:compaction_end",
    "public:summarization_retry_attempt_start",
    "hook:before",
    "hook:success",
    "hook:failed"
  ]);

  for (const entry of trace.filter((event) => reasonEvents.has(event.type))) {
    assert.equal(entry.reason, "manual");
  }

  const duringCompaction = new Set([
    "hook:before",
    "hook:before:awaited",
    "provider:summary",
    "provider:summary:awaited",
    "hook:success"
  ]);

  for (const entry of trace.filter((event) => duringCompaction.has(event.type))) {
    assert.partialDeepStrictEqual(entry, {
      idle: false,
      compacting: true,
      streaming: true,
      agentStreaming: true,
      idleWaitResolved: false
    });
  }

  const settled = trace.filter((event) => event.type === "hook:settled");
  assert.equal(settled.length, 1);
  assert.partialDeepStrictEqual(settled[0], { idle: true, ctxIdle: true, compacting: false });
  const shutdown = trace.filter((event) => event.type === "hook:shutdown");
  assert.equal(shutdown.length, 1);
  assert.equal(shutdown[0]?.patchRestored, true);

  for (const entry of trace.filter((event) =>
    ["provider:main", "hook:settled", "hook:shutdown", "wait:idle"].includes(event.type)
  )) {
    assert.equal(entry.instructionPatchRestored, true);
  }

  for (const entry of trace.filter((event) => event.type === "wait:idle"))
    assert.equal(entry.idle, true);
}

function retentionBudget(scenario: string) {
  if (scenario === "small") return 1000000;
  if (scenario === "instructions-boundary") return 2000;

  return 256;
}

function suppliedInstructions(scenario: string) {
  if (["success", "no-request"].includes(scenario)) return undefined;
  if (scenario === "empty-instructions") return "";

  return "Preserve NATIVE_FOCUS_MARKER and the remaining tests.";
}

function expectedInstructions(requested: string | undefined, fileFocus: boolean) {
  if (!fileFocus) return requested;

  return requested ? `Preserve FILE_FOCUS_MARKER.\n\n${requested}` : "Preserve FILE_FOCUS_MARKER.";
}

function checkEntryFocus(
  trace: Trace,
  entry: "manual" | "auto",
  fileFocus: boolean,
  split: boolean
) {
  const requested = entry === "manual" ? suppliedInstructions("manual") : undefined;
  const expectedFocus = expectedInstructions(requested, fileFocus);
  const request = trace.find((item) => item.type === "provider:summary");
  assert.equal(request?.focus, expectedFocus);
  assert.equal(request?.summaryKind, split ? "prefix" : "history");
  assert.equal(
    trace.find((item) => item.type === "hook:before")?.customInstructions,
    expectedFocus
  );
}

function checkInstructionPrompts(trace: Trace, scenario: string, fileFocus = false) {
  const expectedFocus =
    expectedInstructions(suppliedInstructions(scenario), fileFocus) || undefined;

  for (const entry of trace.filter((item) => item.type === "provider:summary")) {
    assert.equal(entry.focus, expectedFocus);
    assert.equal(entry.additionalFocusCount, expectedFocus ? 1 : 0);
    assert.equal(entry.cacheRetention, "none");
  }

  assert.equal(
    trace.filter((entry) => entry.type === "public:summarization_retry_attempt_start").length,
    scenario === "retry" ? 1 : 0
  );
  if (!scenario.startsWith("instructions-")) return;
  const requests = trace
    .filter((entry) => entry.type === "provider:summary")
    .map((entry) => ({
      kind: entry.summaryKind,
      focused: entry.focus === expectedFocus
    }));
  const expected = [];
  if (scenario !== "instructions-split") expected.push({ kind: "history", focused: true });
  if (scenario !== "instructions-boundary") expected.push({ kind: "prefix", focused: true });
  assert.deepEqual(requests, expected);
  assert.equal(
    trace.find((entry) => entry.type === "hook:before")?.historyMessages,
    scenario === "instructions-split" ? 0 : 2
  );
}

function checkOutput(stdout: string, mode: string, scenario: string, attempts: number) {
  if (mode === "text") {
    assert.equal(stdout.trim(), "TASK_FINISHED");

    return;
  }

  const events = stdout
    .trim()
    .split("\n")
    .map((line) =>
      z
        .object({
          type: z.string(),
          message: z
            .object({
              role: z.string(),
              customType: z.string().optional(),
              stopReason: z.string().optional(),
              errorMessage: z.string().optional()
            })
            .optional()
        })
        .parse(JSON.parse(line))
    );

  for (const type of ["agent_start", "agent_end", "agent_settled"]) {
    assert.equal(events.filter((event) => event.type === type).length, 1);
  }

  for (const type of ["compaction_start", "compaction_end"]) {
    assert.equal(events.filter((event) => event.type === type).length, attempts);
  }

  const hasOutcomeNotice = expectedOutcomeStatus(scenario) !== undefined;

  for (const type of ["message_start", "message_end"]) {
    assert.equal(
      events.filter(
        (event) => event.type === type && event.message?.customType === compactionResultType
      ).length,
      hasOutcomeNotice ? 1 : 0
    );
  }

  if (!hasOutcomeNotice) return;
  const outcomeEndIndex = events.findIndex(
    (event) => event.type === "message_end" && event.message?.customType === compactionResultType
  );
  const responses = events
    .slice(outcomeEndIndex + 1)
    .filter((event) => event.type === "message_end" && event.message?.role === "assistant");
  assert.equal(responses.length, 1);
  // Native abort emits a final error message without another provider request.
  if (scenario === "abort") assert.match(responses[0]?.message?.errorMessage ?? "", /aborted/i);
  else assert.equal(responses[0]?.message?.stopReason, "stop");
}

function expectedOutcomeStatus(scenario: string) {
  if (scenario === "small") return "skipped";
  if (["failure", "missing-model", "auth-failure", "unsupported-thinking"].includes(scenario))
    return "failed";
  if (["cancel", "abort", "escape"].includes(scenario)) return "cancelled";

  return undefined;
}

function checkFailure(trace: Trace, scenario: string) {
  if (expectedOutcomeStatus(scenario) !== "failed" && !["cancel", "escape"].includes(scenario))
    return;
  const failed = trace.filter((event) => event.type === "hook:failed");
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.aborted, ["cancel", "escape"].includes(scenario));
  assert.equal(trace.filter((event) => event.type === "provider:main").at(-1)?.hasOldPayload, true);
}

function checkOutcome(manager: SessionManager, trace: Trace, scenario: string) {
  const outcomes = manager
    .getBranch()
    .filter((entry) => entry.type === "custom_message")
    .filter((entry) => entry.customType === compactionResultType);
  const status = expectedOutcomeStatus(scenario);
  assert.equal(outcomes.length, status === undefined ? 0 : 1);
  const outcome = outcomes[0];

  if (outcome) {
    assert.equal(outcome.customType, "pi-smart-compact.result");
    assert.equal(outcome.display, true);
    assert.partialDeepStrictEqual(outcome.details, { status });
    assert.ok(typeof outcome.content === "string");
    if (status === "cancelled") assert.match(outcome.content, /cancelled/i);
    if (scenario === "small") assert.match(outcome.content, /Pi did not start compaction/);
    if (scenario === "failure") assert.match(outcome.content, /Offline summary failure/);
    if (scenario === "missing-model") assert.match(outcome.content, /model is unavailable/);
    if (scenario === "auth-failure")
      assert.match(outcome.content, /Offline summary authentication failed/);
    if (scenario === "unsupported-thinking")
      assert.match(outcome.content, /thinkingLevel is unsupported/);
  }

  assert.equal(
    manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "user")
      .length,
    ["instructions-history", "instructions-boundary"].includes(scenario) ? 2 : 1
  );

  for (const request of trace.filter((event) => event.type === "provider:main")) {
    assert.deepEqual(
      request.userMessages?.filter((message) => message === outcome?.content),
      request.request === 3 && outcome ? [outcome.content] : []
    );
  }

  assert.equal(
    manager
      .buildSessionProjection()
      .messages.some(
        (message) => message.role === "custom" && message.content === outcome?.content
      ),
    Boolean(outcome)
  );
}

function activeThinking(scenario: string, configured: boolean) {
  return configured && scenario !== "unsupported-thinking" ? "high" : "off";
}

function checkAcknowledgements(
  manager: SessionManager,
  modelOverride: string | undefined,
  thinkingLevel: string,
  expectedCount: number
) {
  const results = manager
    .getBranch()
    .flatMap((entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "compact"
        ? [entry.message]
        : []
    );

  assert.equal(results.length, expectedCount);

  for (const result of results) {
    assert.deepEqual(result.content, [
      {
        type: "text",
        text: "Compaction requested."
      }
    ]);
    assert.deepEqual(result.details, {
      scheduled: true,
      ...(modelOverride ? { modelOverride, thinkingLevel } : {})
    });
  }
}

function checkModelRouting(
  trace: Trace,
  scenario: string,
  config: CompactConfig | undefined,
  manager: SessionManager
) {
  const nativeThinking = activeThinking(scenario, config !== undefined);
  const expectedThinking =
    config?.thinkingLevel ?? (scenario === "no-reasoning" ? "off" : nativeThinking);
  const idleTimeout = scenario === "no-idle-timeout" ? 2147483647 : 4321;

  for (const entry of trace.filter((event) => event.type === "provider:summary")) {
    assert.deepEqual(entry.requestPolicy, {
      timeoutMs: scenario === "provider-timeout" ? 1234 : idleTimeout,
      websocketConnectTimeoutMs: 2345,
      maxRetries: 2,
      maxRetryDelayMs: 3456
    });

    const provider = config?.model ? "summary-compaction-fixture" : "native-compaction-fixture";
    assert.partialDeepStrictEqual(entry, {
      provider,
      model: config?.model ? "nested/summary" : "scripted",
      apiKey: provider,
      authEnv: provider,
      baseUrl: `http://${provider}.invalid`,
      sessionModel: "scripted",
      sessionThinking: nativeThinking
    });
    assert.deepEqual(entry.headers, {
      "X-Fixture-Provider": provider,
      "X-Fixture-Hook": "applied"
    });
    // Native summary shapes use different budgets, but both must honor the selected model's cap.
    if (config?.model) assert.equal(entry.maxTokens, 128);
    assert.equal(entry.reasoning, expectedThinking === "off" ? undefined : expectedThinking);
  }

  for (const entry of trace.filter((event) => event.type === "provider:main")) {
    assert.equal(entry.provider, "native-compaction-fixture");
    assert.equal(entry.model, "scripted");
    assert.deepEqual(entry.headers, {
      "X-Fixture-Provider": "native-compaction-fixture",
      "X-Fixture-Hook": "applied"
    });
    assert.equal(entry.reasoning, nativeThinking === "off" ? undefined : nativeThinking);
  }

  for (const provider of ["native-compaction-fixture", "summary-compaction-fixture"])
    assert.equal(
      trace.filter((event) => event.type === "hook:headers" && event.provider === provider).length,
      trace.filter(
        (event) =>
          ["provider:main", "provider:summary"].includes(event.type) && event.provider === provider
      ).length
    );

  let expectedAcknowledgements = 1;
  if (scenario === "no-request") expectedAcknowledgements = 0;
  if (scenario === "duplicate") expectedAcknowledgements = 2;
  checkAcknowledgements(manager, config?.model, expectedThinking, expectedAcknowledgements);

  return expectedThinking;
}

/** Each default summary records its model in a context-free entry just before the compaction. */
function checkSummaryModelEntries(
  manager: SessionManager,
  config: CompactConfig | undefined,
  thinkingLevel: string,
  trigger: string
) {
  const expected = {
    model: config?.model ?? "native-compaction-fixture/scripted",
    thinkingLevel,
    trigger
  };
  const branch = manager.getBranch();
  const recorded = branch.filter(
    (entry) => entry.type === "custom" && entry.customType === summaryModelEntryType
  );
  const compactions = branch.filter((entry) => entry.type === "compaction" && !entry.fromHook);
  assert.equal(recorded.length, compactions.length);

  for (const compaction of compactions) {
    const previous = branch[branch.indexOf(compaction) - 1];
    assert.ok(previous?.type === "custom");
    assert.equal(previous.customType, "pi-smart-compact.model");
    assert.deepEqual(previous.data, expected);
  }

  assert.ok(
    !manager
      .buildSessionProjection()
      .messages.some(
        (message) => message.role === "custom" && message.customType === summaryModelEntryType
      )
  );
}

const summaryModel = "summary-compaction-fixture/nested/summary";

const toolCases: {
  mode: string;
  scenario: string;
  summaries: number;
  compactions: number;
  attempts: number;
  config?: CompactConfig;
}[] = [
  {
    mode: "json",
    scenario: "provider-timeout",
    summaries: 1,
    compactions: 1,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "no-idle-timeout",
    summaries: 1,
    compactions: 1,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "no-reasoning",
    summaries: 1,
    compactions: 1,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "success",
    summaries: 1,
    compactions: 1,
    attempts: 1,
    config: { applyToManual: true }
  },
  {
    mode: "json",
    scenario: "instructions-history",
    summaries: 2,
    compactions: 1,
    attempts: 1,
    config: { model: summaryModel, thinkingLevel: "low" }
  },
  {
    mode: "json",
    scenario: "retry",
    summaries: 2,
    compactions: 1,
    attempts: 1,
    config: { model: summaryModel, thinkingLevel: "off" }
  },
  {
    mode: "json",
    scenario: "failure",
    summaries: 1,
    compactions: 0,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "escape",
    summaries: 1,
    compactions: 0,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "cancel",
    summaries: 0,
    compactions: 0,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "custom-summary",
    summaries: 0,
    compactions: 1,
    attempts: 1,
    config: { model: "missing/model" }
  },
  {
    mode: "json",
    scenario: "missing-model",
    summaries: 0,
    compactions: 0,
    attempts: 1,
    config: { model: "missing/model" }
  },
  {
    mode: "json",
    scenario: "auth-failure",
    summaries: 0,
    compactions: 0,
    attempts: 1,
    config: { model: summaryModel }
  },
  {
    mode: "json",
    scenario: "unsupported-thinking",
    summaries: 0,
    compactions: 0,
    attempts: 1,
    config: { model: summaryModel, thinkingLevel: "low" }
  },
  {
    mode: "json",
    scenario: "success",
    summaries: 1,
    compactions: 1,
    attempts: 1,
    config: { thinkingLevel: "off" }
  },
  { mode: "text", scenario: "success", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "failure", summaries: 1, compactions: 0, attempts: 1 },
  { mode: "json", scenario: "abort", summaries: 1, compactions: 0, attempts: 1 },
  { mode: "text", scenario: "small", summaries: 0, compactions: 0, attempts: 0 },
  { mode: "text", scenario: "no-request", summaries: 0, compactions: 0, attempts: 0 },
  { mode: "json", scenario: "instructions-history", summaries: 2, compactions: 1, attempts: 1 },
  { mode: "text", scenario: "empty-instructions", summaries: 1, compactions: 1, attempts: 1 },
  ...[
    { scenario: "success", summaries: 1 },
    { scenario: "empty-instructions", summaries: 1 },
    { scenario: "duplicate", summaries: 1 },
    { scenario: "instructions-split", summaries: 1 },
    { scenario: "instructions-history", summaries: 2 },
    { scenario: "instructions-boundary", summaries: 1 },
    { scenario: "retry", summaries: 2 },
    { scenario: "cancel", summaries: 0 },
    { scenario: "custom-summary", summaries: 0 }
  ].map(({ scenario, summaries }) => ({
    mode: "json",
    scenario,
    summaries,
    compactions: scenario === "cancel" ? 0 : 1,
    attempts: 1,
    config: { instructionsFile: "focus.txt" }
  }))
];

it.each(toolCases)(
  "native compaction in $mode mode: $scenario ($config)",
  async ({ mode, scenario, summaries, compactions, attempts, config }) => {
    const directory = await createValidationWorkspace("pi-native-compaction-");

    try {
      const tracePath = join(directory, "trace.jsonl");
      const sessionPath = join(directory, "session.jsonl");
      const keepRecentTokens = retentionBudget(scenario);
      const requested = suppliedInstructions(scenario);
      const fileFocus = config?.instructionsFile !== undefined;
      const instructions = expectedInstructions(requested, fileFocus);
      await writeFile(join(directory, "agent", "focus.txt"), "Preserve FILE_FOCUS_MARKER.\n");
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
          "ext.pi-smart-compact": config,
          compaction: {
            enabled: false,
            reserveTokens: 777,
            keepRecentTokens: 99999,
            modelOverrides: {
              "native-compaction-fixture/scripted": {
                reserveTokens: 512,
                keepRecentTokens
              }
            }
          },
          httpIdleTimeoutMs: scenario === "no-idle-timeout" ? 0 : 4321,
          websocketConnectTimeoutMs: 2345,
          retry: {
            enabled: scenario === "retry",
            maxRetries: 1,
            baseDelayMs: 1,
            provider: {
              timeoutMs: scenario === "provider-timeout" ? 1234 : undefined,
              maxRetries: 2,
              maxRetryDelayMs: 3456
            }
          }
        })
      );
      const launch = await createPiLaunch({
        directory,
        env: { PI_NATIVE_COMPACTION_TRACE: tracePath, PI_NATIVE_COMPACTION_CASE: scenario },
        args: [
          "--no-extensions",
          "--no-skills",
          "--no-themes",
          "--no-prompt-templates",
          "--no-context-files",
          "--tools",
          "compact,fixture_work",
          "-e",
          fileURLToPath(new URL("../index.ts", import.meta.url)),
          "-e",
          fileURLToPath(new URL("./provider.ts", import.meta.url)),
          "--provider",
          "native-compaction-fixture",
          "--model",
          "scripted",
          "--thinking",
          activeThinking(scenario, config !== undefined),
          "--session",
          sessionPath,
          "--print",
          "--mode",
          mode,
          "Do the fixture work, compact using the tool, and finish the task." +
            (scenario === "instructions-boundary"
              ? ` ${"CURRENT_REQUEST_PAYLOAD ".repeat(500)}`
              : "")
        ]
      });
      const child = promisify(execFile)(launch.command, launch.args, {
        ...launch.options,
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024
      });
      child.child.stdin?.end();
      const { stdout, stderr } = await child;
      assert.equal(stderr, "");

      checkOutput(stdout, mode, scenario, attempts);

      const trace = (await readFile(tracePath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => traceSchema.parse(JSON.parse(line)));
      const ofType = (type: string) => trace.filter((event) => event.type === type);
      checkCompactionLifecycle(trace);
      assert.equal(ofType("provider:summary").length, summaries);
      assert.equal(ofType("hook:before").length, attempts);
      assert.equal(ofType("hook:success").length, compactions);
      assert.equal(ofType("wait:idle").length, attempts);

      for (const entry of ofType("hook:before")) {
        assert.equal(entry.reason, "manual");
        assert.equal(entry.customInstructions, instructions);
        assert.equal(entry.isSplitTurn, scenario !== "instructions-boundary");
        assert.deepEqual(entry.settings, {
          enabled: false,
          keepRecentTokens,
          reserveTokens: 512
        });
        const toolResults = entry.branch
          ?.filter((item) => item.role === "toolResult")
          .map((item) => item.toolName);
        assert.deepEqual(
          toolResults,
          scenario === "duplicate"
            ? ["fixture_work", "compact", "compact", "fixture_work"]
            : ["fixture_work", "compact", "fixture_work"]
        );
      }

      checkInstructionPrompts(trace, scenario, fileFocus);

      const manager = SessionManager.open(sessionPath);
      const thinkingLevel = checkModelRouting(trace, scenario, config, manager);
      checkSummaryModelEntries(manager, config, thinkingLevel, "tool");
      const savedCompactions = manager.getBranch().filter((entry) => entry.type === "compaction");
      assert.equal(savedCompactions.length, compactions);
      checkOutcome(manager, trace, scenario);

      if (compactions) {
        assert.equal(ofType("hook:success")[0]?.fromExtension, scenario === "custom-summary");
        const saved = savedCompactions[0];
        assert.ok(saved);
        assert.ok(saved.summary.includes("NATIVE_FIXTURE_CHECKPOINT"));
        assert.equal(
          saved.usage?.totalTokens,
          scenario === "custom-summary"
            ? undefined
            : ofType("provider:summary:awaited").length * 140
        );
        if (scenario === "custom-summary") assert.deepEqual(saved.details, { custom: true });
        assert.partialDeepStrictEqual(ofType("provider:main").at(-1), {
          request: 3,
          idle: false,
          compacting: false,
          hasCheckpoint: true,
          hasOldPayload: false
        });
      }

      if (scenario === "abort") {
        assert.equal(ofType("provider:main").length, 2);
        assert.ok(!stdout.includes("TASK_FINISHED"));
        assert.equal(ofType("hook:failed")[0]?.aborted, true);
      } else {
        assert.equal(ofType("provider:main").length, scenario === "no-request" ? 2 : 3);
      }

      checkFailure(trace, scenario);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);

it.each(
  (["manual", "auto"] as const).flatMap((entry) => [
    ...[undefined, true].map((enabled) => ({
      entry,
      enabled,
      fileFocus: false,
      split: false
    })),
    ...[false, true].map((split) => ({ entry, enabled: false, fileFocus: true, split })),
    { entry, enabled: true, fileFocus: true, split: true }
  ])
)(
  "bundled CLI $entry compaction (opt-in: $enabled, file focus: $fileFocus, split: $split)",
  async ({ entry, enabled, fileFocus, split }) => {
    const directory = await createValidationWorkspace("pi-manual-compact-cli-");

    try {
      const tracePath = join(directory, "trace.jsonl");
      const sessionPath = join(directory, "session.jsonl");
      await writeFile(join(directory, "agent", "focus.txt"), "Preserve FILE_FOCUS_MARKER.\n");
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
          "ext.pi-smart-compact": {
            model: summaryModel,
            thinkingLevel: "low",
            instructionsFile: fileFocus ? "focus.txt" : undefined,
            // The other entry point's opt-in must not route this operation.
            applyToManual: entry === "manual" ? enabled : true,
            applyToAuto: entry === "auto" ? enabled : true
          },
          compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 },
          retry: { enabled: false }
        })
      );
      const launch = await createPiLaunch({
        directory,
        env: {
          PI_NATIVE_COMPACTION_TRACE: tracePath,
          PI_NATIVE_COMPACTION_CASE: split ? "manual-split" : "manual"
        },
        args: [
          "--no-extensions",
          "--no-skills",
          "--no-themes",
          "--no-prompt-templates",
          "--no-context-files",
          "-e",
          fileURLToPath(new URL("../index.ts", import.meta.url)),
          "-e",
          fileURLToPath(new URL("./provider.ts", import.meta.url)),
          "--provider",
          "native-compaction-fixture",
          "--model",
          "scripted",
          "--thinking",
          "high",
          "--session",
          sessionPath,
          "--print",
          "--mode",
          "json",
          entry === "manual" ? "/fixture_manual_compact" : "/fixture_auto_compact"
        ]
      });
      const child = promisify(execFile)(launch.command, launch.args, {
        ...launch.options,
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024
      });
      child.child.stdin?.end();
      const { stderr } = await child;
      assert.equal(stderr, "");
      const trace = (await readFile(tracePath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => traceSchema.parse(JSON.parse(line)));
      const requests = trace.filter((entry) => entry.type === "provider:summary");
      const provider = enabled ? "summary-compaction-fixture" : "native-compaction-fixture";
      assert.equal(requests.length, 1);
      assert.partialDeepStrictEqual(requests[0], {
        provider,
        model: enabled ? "nested/summary" : "scripted",
        reasoning: enabled ? "low" : "high",
        apiKey: provider,
        authEnv: provider,
        baseUrl: `http://${provider}.invalid`,
        headers: { "X-Fixture-Provider": provider, "X-Fixture-Hook": "applied" },
        sessionModel: "scripted",
        sessionThinking: "high"
      });
      if (enabled) assert.equal(requests[0]?.maxTokens, 128);
      checkEntryFocus(trace, entry, fileFocus, split);
      assert.equal(
        trace.find((item) => item.type === "hook:before")?.reason,
        entry === "manual" ? "manual" : "threshold"
      );
      assert.equal(
        trace.find((entry) => entry.type === "fixture:entry")?.instructionPatchRestored,
        true
      );
      assert.equal(trace.find((entry) => entry.type === "hook:shutdown")?.patchRestored, true);
      assert.equal(trace.filter((entry) => entry.type === "provider:main").length, 0);
      const branch = SessionManager.open(sessionPath).getBranch();
      assert.equal(branch.filter((entry) => entry.type === "compaction").length, 1);
      assert.ok(!branch.some((entry) => entry.type === "custom_message"));
      checkSummaryModelEntries(
        SessionManager.open(sessionPath),
        enabled ? { model: summaryModel } : undefined,
        enabled ? "low" : "high",
        entry === "manual" ? "manual" : "threshold"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);
