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

const traceSchema = z.object({
  type: z.string(),
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
  hasAdditionalFocus: z.boolean().optional(),
  additionalFocusCount: z.number().optional(),
  cacheRetention: z.string().optional(),
  instructionPatchRestored: z.boolean().optional(),
  request: z.number().optional(),
  hasCheckpoint: z.boolean().optional(),
  hasOldPayload: z.boolean().optional(),
  compactionOutcomes: z.array(z.string()).optional(),
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

function checkInstructionPrompts(trace: Trace, scenario: string) {
  for (const entry of trace.filter((item) => item.type === "provider:summary")) {
    assert.equal(entry.additionalFocusCount, suppliedInstructions(scenario) ? 1 : 0);
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
      focused: entry.hasAdditionalFocus
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
        (event) => event.type === type && event.message?.customType === "smart-compaction-result"
      ).length,
      hasOutcomeNotice ? 1 : 0
    );
  }

  if (!hasOutcomeNotice) return;
  const outcomeEndIndex = events.findIndex(
    (event) =>
      event.type === "message_end" && event.message?.customType === "smart-compaction-result"
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
  if (scenario === "failure") return "failed";
  if (["cancel", "abort", "escape"].includes(scenario)) return "cancelled";

  return undefined;
}

function checkOutcome(manager: SessionManager, trace: Trace, scenario: string) {
  const outcomes = manager
    .getBranch()
    .filter((entry) => entry.type === "custom_message")
    .filter((entry) => entry.customType === "smart-compaction-result");
  const status = expectedOutcomeStatus(scenario);
  assert.equal(outcomes.length, status === undefined ? 0 : 1);
  const outcome = outcomes[0];

  if (outcome) {
    assert.equal(outcome.display, true);
    assert.partialDeepStrictEqual(outcome.details, { status });
    assert.ok(typeof outcome.content === "string");
    assert.ok(outcome.content.startsWith(`Compaction ${status}`));
    if (scenario === "small") assert.match(outcome.content, /Pi did not start compaction/);
    if (scenario === "failure") assert.match(outcome.content, /Offline summary failure/);
  }

  assert.equal(
    manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "user")
      .length,
    ["instructions-history", "instructions-boundary"].includes(scenario) ? 2 : 1
  );

  for (const request of trace.filter((event) => event.type === "provider:main")) {
    assert.deepEqual(
      request.compactionOutcomes,
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

it.each([
  { mode: "text", scenario: "success", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "success", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "duplicate", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "cancel", summaries: 0, compactions: 0, attempts: 1 },
  { mode: "json", scenario: "failure", summaries: 1, compactions: 0, attempts: 1 },
  { mode: "json", scenario: "abort", summaries: 1, compactions: 0, attempts: 1 },
  { mode: "json", scenario: "escape", summaries: 1, compactions: 0, attempts: 1 },
  { mode: "text", scenario: "small", summaries: 0, compactions: 0, attempts: 0 },
  { mode: "text", scenario: "no-request", summaries: 0, compactions: 0, attempts: 0 },
  { mode: "json", scenario: "instructions-split", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "instructions-history", summaries: 2, compactions: 1, attempts: 1 },
  { mode: "text", scenario: "instructions-boundary", summaries: 1, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "retry", summaries: 2, compactions: 1, attempts: 1 },
  { mode: "json", scenario: "custom-summary", summaries: 0, compactions: 1, attempts: 1 },
  { mode: "text", scenario: "empty-instructions", summaries: 1, compactions: 1, attempts: 1 }
])(
  "native compaction in $mode mode: $scenario",
  async ({ mode, scenario, summaries, compactions, attempts }) => {
    const directory = await createValidationWorkspace("pi-native-compaction-");

    try {
      const tracePath = join(directory, "trace.jsonl");
      const sessionPath = join(directory, "session.jsonl");
      const keepRecentTokens = retentionBudget(scenario);
      const instructions = suppliedInstructions(scenario);
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
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
          retry: { enabled: scenario === "retry", maxRetries: 1, baseDelayMs: 1 }
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
          "off",
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

      checkInstructionPrompts(trace, scenario);

      const manager = SessionManager.open(sessionPath);
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
        assert.deepEqual(
          saved.details,
          scenario === "custom-summary" ? { custom: true } : { readFiles: [], modifiedFiles: [] }
        );
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

      if (["failure", "cancel", "escape"].includes(scenario)) {
        assert.equal(ofType("hook:failed").length, 1);
        assert.equal(ofType("hook:failed")[0]?.aborted, scenario !== "failure");
        assert.equal(ofType("provider:main").at(-1)?.hasOldPayload, true);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000
);
