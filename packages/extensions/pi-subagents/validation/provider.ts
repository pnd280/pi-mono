import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setTimeout } from "node:timers/promises";

import {
  contentText,
  createProvider,
  fauxToolCall,
  getCurrentTools,
  getCurrentSystemPrompt,
  type JsonObject,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import {
  createFixtureStream,
  zeroUsage,
  type FixtureStreamContext
} from "@pi-mono/libs/validation/provider";

import { assertFixtureWorkspace } from "./workspace.ts";

export const FIXTURE_PROVIDER = "subagents-fixture";

export const FIXTURE_MODEL = `${FIXTURE_PROVIDER}/scripted`;

/** A model with thinking levels, unlike the supervisor's. */
const REASONING_MODEL = `${FIXTURE_PROVIDER}/reasoning`;

/** Each supervisor process fails its first `background-retry` reply once. */
let retried = false;

/** The `pi.events` channel on which `extension.ts` reports each pending background result. */
export const PENDING_RESULT_CHANNEL = "pi-subagents-fixture:pending-result";

/** A background result is pending in this supervisor process. */
let resultPending = false;

/** A `background-idle` supervisor creates this file after its final turn for its child. */
const IDLE_RELEASE = "idle-release";

type Call =
  | {
      /** The called tool; `subagent` when omitted. */
      tool?: "subagent_abort";
      description: string;
      prompt: string;
      task_id?: string;
      model?: string;
      thinking?: string;
      background?: boolean;
      delivery?: "steer" | "follow_up";
    }
  | { tool: "job"; description: string; command: string; timeout?: number }
  | { tool: "job_abort"; job_id: string }
  | { tool: "read"; path: string };

/**
 * Fixed job commands; prompt text never becomes a command. They run in the supervisor's working
 * directory, where the tests create the barrier files.
 */
const JOB_COMMANDS = new Map<string, { command: string; timeout?: number }>([
  ["fast", { command: "printf 'Fixture job output'" }],
  [
    "barrier",
    { command: "while [ ! -e job-release ]; do sleep 0.05; done; printf 'Fixture job output'" }
  ],
  // Field 5 of the stat line is the process group. Both sleeps fork into it before the marker, so a
  // stop of the shell alone leaves the group alive.
  ["group", { command: "sleep 600 & sleep 600 & cut -d ' ' -f 5 /proc/$$/stat > job-group; wait" }],
  // A numbered line five times a second until `job-release` exists, for the manual log viewer checks.
  [
    "stream",
    {
      command: `i=0; while [ ! -e job-release ]; do i=$((i + 1)); printf 'Fixture job line %s\\n' "$i"; sleep 0.2; done`
    }
  ],
  ["shell", { command: `printf '%s %s' "$FIXTURE_JOB_SHELL" "$FIXTURE_JOB_PREFIX"` }],
  ["timeout", { command: "sleep 600", timeout: 1 }]
]);

/** `job-<kind>`, also with `-hold`, starts one job; `job-abort-id <job_id>` aborts one. */
function jobPlan(scenario: string): Call[] | undefined {
  const abort = /^job-abort-id (\S+)$/.exec(scenario)?.[1];
  if (abort) return [{ tool: "job_abort", job_id: abort }];
  const kind = /^job-(\w+?)(?:-hold)?$/.exec(scenario)?.[1];
  const job = kind ? JOB_COMMANDS.get(kind) : undefined;

  return job && [{ tool: "job", description: `Fixture ${kind} job`, ...job }];
}

function continuationPlan(scenario: string): Call[] | undefined {
  const abort = /^abort-id ([0-9a-f-]{36})$/.exec(scenario)?.[1];
  if (abort) return [{ tool: "subagent_abort", description: "", prompt: "", task_id: abort }];
  const update = /^update-id ([0-9a-f-]{36}) (steer|follow_up)$/.exec(scenario);
  if (update?.[1])
    return [
      {
        description: "Update existing task",
        task_id: update[1],
        prompt: "input-payload",
        delivery: update[2] === "steer" ? "steer" : "follow_up"
      }
    ];
  const owner = /^owner-resume ([0-9a-f-]{36}) ([0-9a-f-]{36})$/.exec(scenario);
  if (owner?.[1] && owner[2])
    return [
      {
        description: "Resume through owner",
        task_id: owner[1],
        prompt: `update-id ${owner[2]} follow_up`
      }
    ];
  const compact = /^digest-compact ([0-9a-f-]{36})$/.exec(scenario)?.[1];
  if (compact)
    return [
      { description: "Compact child conversation", task_id: compact, prompt: "digest-compact" }
    ];
  const history = /^(extend|history)-id ([0-9a-f-]{36})$/.exec(scenario);
  if (history?.[2])
    return [
      {
        description: "Resumed history",
        task_id: history[2],
        prompt: history[1] === "extend" ? "nested-background" : "history-context"
      }
    ];
  const resumedActivity = /^resume-activity-id ([0-9a-f-]{36})$/.exec(scenario)?.[1];
  if (resumedActivity)
    return [
      { description: "Resumed activity", prompt: "activity-write", task_id: resumedActivity }
    ];
  const resumedStubborn = /^stubborn-id ([0-9a-f-]{36})$/.exec(scenario)?.[1];
  if (resumedStubborn)
    return [{ description: "Resume stubborn", prompt: "ignore-abort", task_id: resumedStubborn }];
  const resumedSlow = /^resume-slow-id ([0-9a-f-]{36})$/.exec(scenario)?.[1];

  return resumedSlow
    ? [{ description: "Resume without activity", prompt: "slow", task_id: resumedSlow }]
    : undefined;
}

/** A launch on the reasoning model, then resumes that set only the given fixture model and level. */
function selectionPlan(scenario: string): Call[] | undefined {
  if (scenario === "delegate-reasoning")
    return [
      {
        description: "Fixture selection task",
        prompt: "report-selection",
        model: REASONING_MODEL,
        thinking: "high"
      }
    ];
  const resumed = /^selection-id ([0-9a-f-]{36})(?: model=(\S+))?(?: thinking=(\S+))?$/.exec(
    scenario
  );
  if (!resumed?.[1]) return;

  return [
    {
      description: "Resume selection",
      task_id: resumed[1],
      prompt: "report-selection",
      ...(resumed[2] ? { model: `${FIXTURE_PROVIDER}/${resumed[2]}` } : {}),
      ...(resumed[3] ? { thinking: resumed[3] } : {})
    }
  ];
}

function supervisorPlan(scenario: string, completed = 0): Call[] | undefined {
  const continuation = continuationPlan(scenario) ?? selectionPlan(scenario) ?? jobPlan(scenario);
  if (continuation) return continuation;
  if (scenario === "failure-then-reply")
    return supervisorPlan(completed === 0 ? "delegate-launch-error" : "delegate-reply");
  // A job, then a tool turn that the model holds until the test creates `run-release`.
  if (scenario === "job-turn")
    return completed === 0
      ? jobPlan("job-barrier")
      : [{ tool: "read", path: ".pi-subagents-fixture" }];
  if (scenario === "promote-pair")
    return [
      { description: "Promote after usage", prompt: "activity-promote" },
      { description: "Abort foreground", prompt: "slow" }
    ];
  if (scenario === "background-pair")
    return [
      { description: "Fast background task", prompt: "finite", background: true },
      { description: "Late background task", prompt: "finite-late", background: true }
    ];
  if (scenario === "activity-pair")
    return [
      { description: "Read activity task", prompt: "activity-read" },
      { description: "Write activity task", prompt: "activity-write" }
    ];
  const nested = new Map([
    ["background-idle", "finite-idle"],
    ["background-busy", "finite"],
    ["background-late", "finite-late"],
    ["background-error", "finite"],
    ["background-busy-error", "finite"],
    ["background-retry", "finite-late"],
    ["background-slow", "slow"],
    ["background-stubborn", "ignore-abort"],
    ["background-abort-tool", "abort-tool"],
    ["background-input", "input-hold"],
    ["background-settling", "settle-hold"],
    ["background-exiting", "exit-hold"],
    ["background-owner", "background-input"],
    ["background-owner-live", "owner-linger"],
    ["background-digest", "activity-digest"],
    ["owner-linger", "reply"],
    ["owner-linger-abort", "slow"],
    ["nested-background", "background-idle"],
    ["nested-slow", "background-slow"],
    ["nested-error", "background-error"],
    ["nested-stubborn", "background-stubborn"],
    ["nested-dialog", "delegate-dialog"],
    ["nested-depth", "delegate-tools"],
    ["nested-capacity", "delegate-reply"],
    ["nested-failure", "failure-then-reply"],
    ["nested-foreground", "delegate-slow"]
  ]).get(scenario);
  if (nested)
    return [
      {
        description: `Fixture ${scenario}`,
        prompt: nested,
        background: scenario.startsWith("background-")
      }
    ];
  const child = new Map([
    ["delegate-reply", "reply"],
    ["delegate-command", "/fixture-run"],
    ["delegate-error", "error"],
    ["delegate-cancelled", "cancelled"],
    ["delegate-shutdown-blocked", "shutdown-blocked"],
    ["delegate-slow", "slow"],
    ["delegate-stubborn", "ignore-abort"],
    ["delegate-remember", "remember"],
    ["delegate-dialog", "dialog"],
    ["delegate-selection", "selection"],
    ["delegate-trust", "report-trust"],
    ["delegate-tools", "report-tools"],
    ["delegate-job", "job-group-hold"]
  ]).get(scenario);
  if (child) return [{ description: `Fixture ${child} task`, prompt: child }];
  if (scenario === "delegate-display")
    return [
      {
        description: "Review 界面 é 👩‍💻\u001b[31m unsafe label\u001b[0m",
        prompt: [
          "display",
          ...Array.from({ length: 11 }, (_, index) => `Prompt line ${index + 2}`)
        ].join("\n")
      }
    ];
  if (scenario === "delegate-launch-error")
    return [
      {
        description: "Fixture launch failure",
        prompt: "reply",
        model: "pi-subagents-missing-provider/no-such-model"
      }
    ];
  if (scenario === "capacity")
    return [
      { description: "First capacity task", prompt: "slow" },
      { description: "Second capacity task", prompt: "reply" },
      { description: "Third capacity task", prompt: "reply" },
      { description: "Overflow capacity task", prompt: "reply" }
    ];
  const resumed = /^resume-id ([0-9a-f-]{36})$/.exec(scenario)?.[1];

  return resumed
    ? [{ description: "Recall earlier context", prompt: "recall", task_id: resumed }]
    : undefined;
}

function planCall(call: Call, id: string) {
  if (call.tool === "job" || call.tool === "job_abort" || call.tool === "read") {
    const { tool, ...args } = call;

    return fauxToolCall(tool, args, { id });
  }

  const { tool, ...args } = call;
  const arguments_: JsonObject =
    tool === "subagent_abort" ? { task_id: args.task_id ?? "" } : { ...args };

  return fauxToolCall(tool ?? "subagent", arguments_, { id });
}

/** Keeps the run busy before a final reply without background results. */
async function holdFinalReply(scenario: string, signal: AbortSignal | undefined): Promise<void> {
  // The final reply ends only after the result is pending, so the result arrives while busy.
  if (["background-busy", "background-busy-error"].includes(scenario))
    while (!resultPending) await setTimeout(25, undefined, { signal });
  if (/^job-\w+-hold$/.test(scenario) || ["owner-linger", "owner-linger-abort"].includes(scenario))
    await runRelease(signal);
}

/** Keeps the second `job-turn` tool turn busy until the test releases it. */
async function holdToolTurn(
  scenario: string,
  completed: number,
  signal: AbortSignal | undefined
): Promise<void> {
  if (scenario === "job-turn" && completed === 1) await runRelease(signal);
}

/**
 * Keeps a child running: `finite` briefly; `finite-idle` also until `idle-release`;
 * `finite-late` and `input-hold` until `run-release`.
 */
async function holdChildReply(scenario: string, signal: AbortSignal | undefined): Promise<void> {
  if (["finite", "finite-idle"].includes(scenario)) await setTimeout(1500, undefined, { signal });
  // The result reaches the supervisor only after its final turn, so that turn cannot take it.
  if (scenario === "finite-idle") await runRelease(signal, IDLE_RELEASE);
  if (["finite-late", "input-hold"].includes(scenario)) await runRelease(signal);
}

/** `background-pair` lets its late task finish once the first result has continued the run. */
async function releaseLateTask(scenario: string, completions: number): Promise<void> {
  if (scenario === "background-pair" && completions === 1)
    await writeFile(join(process.cwd(), "run-release"), "");
}

/**
 * Waits until `file` exists or the run is aborted. The test creates `run-release`, except in
 * `background-pair`, whose supervisor creates it for its late task.
 */
async function runRelease(signal: AbortSignal | undefined, file = "run-release"): Promise<void> {
  while (!existsSync(join(process.cwd(), file))) await setTimeout(25, undefined, { signal });
}

/** Resolves when an RPC `prompt` command reaches this child's stdin, or stdin ends. */
function nextPromptCommand(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  const done = () => {
    process.stdin.off("data", onData);
    process.stdin.off("end", done);
    resolve();
  };

  const onData = (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    if (
      lines.some((line) => {
        const command: unknown = JSON.parse(line);

        return typeof command === "object" && command !== null && "type" in command
          ? command.type === "prompt"
          : false;
      })
    )
      done();
  };

  process.stdin.on("data", onData);
  process.stdin.once("end", done);

  return promise;
}

/** A final reply without results fails: once without retry, or once with a retryable error. */
function failFinalReply(scenario: string, completions: number): void {
  // `background-busy-error` fails after its held reply, when the result is already ready.
  if (["background-error", "background-busy-error"].includes(scenario) && !completions)
    throw new Error("Fixture provider error");

  if (scenario === "background-retry" && !retried) {
    retried = true;
    throw new Error("Fixture 503 service unavailable");
  }
}

/** Text, then a tool call that only an abort ends; Pi then adds an empty message to the run. */
function abortToolResponse({ message, events, text }: FixtureStreamContext): "toolUse" {
  text("Fixture text before the tool");
  const call = fauxToolCall("bash", { command: "sleep 600" }, { id: "fixture-abort-tool" });
  const contentIndex = message.content.length;
  message.content.push(call);
  events.push({ type: "toolcall_start", contentIndex, partial: message });
  events.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: message });

  return "toolUse";
}

function plainResponse(
  scenario: string,
  context: Parameters<ProviderStreams["stream"]>[1],
  answer: boolean
): string {
  if (scenario === "input-payload")
    return `Input occurrences: ${context.messages.filter((item) => item.role === "user" && contentText(item.content) === "input-payload").length}; earlier context: ${context.messages.some((item) => item.role === "user" && contentText(item.content).endsWith("-hold"))}`;
  if (scenario.startsWith("display\n"))
    return "Wide 界面 é 👩‍💻\n\u001b[2J\u001b]0;unsafe title\u0007Literal child text";
  if (scenario === "remember") return "Fixture seed recorded";
  if (scenario === "history-context")
    return JSON.stringify(
      context.messages
        .filter((item) => item.role === "user")
        .map((item) => contentText(item.content))
    );

  if (scenario === "recall") {
    const remembered = context.messages.some(
      (item) => item.role === "user" && contentText(item.content).trim() === "remember"
    );

    return remembered ? "Remembered fixture seed" : "No earlier fixture seed";
  }

  if (scenario === "dialog") return answer ? "Dialog accepted" : "Dialog declined";
  if (scenario === "selection") return answer ? "Selected second option" : "Selected wrong option";
  if (scenario === "report-trust")
    return JSON.stringify({
      approve: process.argv.includes("--approve"),
      no_approve: process.argv.includes("--no-approve")
    });
  if (scenario === "report-docs")
    return (
      getCurrentTools(context.messages).find((tool) => tool.name === "subagent")?.description ?? ""
    );

  return ["reply", "finite", "finite-idle", "finite-late", "shutdown-blocked"].includes(scenario)
    ? "Fixture reply"
    : "Choose a subagents fixture scenario.";
}

function createStream(
  dialogAnswer: () => boolean,
  idleWake: () => boolean
): ProviderStreams["streamSimple"] {
  return (model, context, { signal, reasoning } = {}) => {
    let userIndex = context.messages.length - 1;

    while (userIndex >= 0) {
      const candidate = context.messages[userIndex];
      if (candidate?.role === "user" && !/<task|<job/.test(contentText(candidate.content))) break;
      userIndex--;
    }

    const user = context.messages[userIndex];
    const prompt = user?.role === "user" ? contentText(user.content).trim() : "";
    const scenario = idleWake() ? "idle-wake" : prompt;
    const plannedSteps = ["failure-then-reply", "job-turn"].includes(scenario) ? 2 : 1;
    const activityDelay = ["activity-promote", "activity-digest"].includes(scenario) ? 4000 : 1200;
    if (scenario === "abort-tool")
      return createFixtureStream({
        model,
        signal,
        run: async (stream) => abortToolResponse(stream)
      });
    if (scenario === "report-selection")
      return createFixtureStream({
        model,
        signal,
        run: async ({ text }) => {
          text(`Selection: ${model.provider}/${model.id}:${reasoning ?? "off"}`);

          return "stop";
        }
      });
    let requestSignal = signal;
    if (scenario === "ignore-abort") requestSignal = undefined;
    else if (scenario === "cancelled")
      requestSignal = AbortSignal.abort(new Error("Fixture child cancelled"));

    return createFixtureStream({
      model,
      signal: requestSignal,
      async run({ message, events, text }) {
        message.usage.input = 10;
        message.usage.output = 5;
        message.usage.totalTokens = 15;
        message.usage.cost.total = 0.001;
        const results = context.messages
          .slice(userIndex + 1)
          .filter((item) => item.role === "toolResult");
        const plan = supervisorPlan(scenario, results.length);

        if (plan) {
          const completed = results.length >= plannedSteps;

          if (completed) {
            const completions = context.messages.filter(
              (item) =>
                item.role === "user" &&
                /<summary>Background (task|job) (completed|failed|cancelled):/.test(
                  contentText(item.content)
                )
            );
            if (!completions.length) await holdFinalReply(scenario, signal);
            failFinalReply(scenario, completions.length);
            await releaseLateTask(scenario, completions.length);
            text(
              `Supervisor finished; background results ${completions.length}\n${results.map((item) => contentText(item.content)).join("\n")}\n${completions.map((item) => contentText(item.content)).join("\n")}`
            );

            return "stop";
          }

          await holdToolTurn(scenario, results.length, signal);

          for (const [index, args] of plan.entries()) {
            const call = planCall(args, `fixture-subagent-${userIndex}-${results.length}-${index}`);
            message.content.push(call);
            events.push({ type: "toolcall_start", contentIndex: index, partial: message });
            events.push({
              type: "toolcall_delta",
              contentIndex: index,
              delta: JSON.stringify(call.arguments),
              partial: message
            });
            events.push({
              type: "toolcall_end",
              contentIndex: index,
              toolCall: call,
              partial: message
            });
          }

          return "toolUse";
        }

        if (scenario === "error") throw new Error("Fixture provider error");

        if (
          ["activity-read", "activity-write", "activity-promote", "activity-digest"].includes(
            scenario
          )
        ) {
          const hadTool = context.messages
            .slice(userIndex + 1)
            .some((item) => item.role === "toolResult");

          if (hadTool) {
            await setTimeout(activityDelay, undefined, { signal });
            text("Activity fixture finished");

            return "stop";
          }

          const call =
            scenario !== "activity-write"
              ? fauxToolCall(
                  "read",
                  { path: ".pi-subagents-fixture" },
                  { id: "shared-activity-call" }
                )
              : fauxToolCall(
                  "write",
                  { path: "activity.txt", content: "Fixture activity\n" },
                  { id: "shared-activity-call" }
                );
          if (scenario === "activity-digest")
            message.content.push({ type: "thinking", thinking: "DO_NOT_SHOW_THINKING" });
          const contentIndex = message.content.length;
          message.content.push(call);
          events.push({ type: "toolcall_start", contentIndex, partial: message });
          events.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: message });

          return "toolUse";
        }

        await holdChildReply(scenario, signal);

        if (scenario === "idle-wake") {
          text(
            `Idle continuation prepared: ${getCurrentSystemPrompt(context.messages).includes("SUBAGENTS_PREPARED_CONTEXT")}`
          );

          return "stop";
        }

        if (scenario === "report-tools") {
          text(
            `subagent available: ${getCurrentTools(context.messages).some((tool) => tool.name === "subagent")}`
          );

          return "stop";
        }

        const reported = new Map([
          ["report-subagent-tools", "subagent"],
          ["report-job-tools", "job"]
        ]).get(scenario);

        if (reported) {
          const names = getCurrentTools(context.messages).map((tool) => tool.name);
          text(
            `${reported} tools: ${names.includes(reported)} ${names.includes(`${reported}_abort`)}`
          );

          return "stop";
        }

        if (scenario === "report-context") {
          text(
            context.messages
              .filter((item) => item.role === "user")
              .map((item) => contentText(item.content))
              .join("\n")
          );

          return "stop";
        }

        if (scenario === "slow") {
          for (let i = 0; i < 60; i++) await setTimeout(1_000, undefined, { signal });
          text("Fixture slow reply");

          return "stop";
        }

        if (scenario === "ignore-abort") {
          const hadTool = context.messages
            .slice(userIndex + 1)
            .some((item) => item.role === "toolResult");

          if (!hadTool) {
            // Only fixed scenarios execute; prompt text never becomes a command or a path.
            const call = fauxToolCall(
              "bash",
              { command: "printf completed > interrupted-effect; sleep 600" },
              { id: "fixture-sleep" }
            );
            message.content.push(call);
            events.push({ type: "toolcall_start", contentIndex: 0, partial: message });
            events.push({
              type: "toolcall_delta",
              contentIndex: 0,
              delta: JSON.stringify(call.arguments),
              partial: message
            });
            events.push({
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: call,
              partial: message
            });

            return "toolUse";
          }

          for (;;) await setTimeout(60_000);
        }

        text(plainResponse(scenario, context, dialogAnswer()));

        return "stop";
      }
    });
  };
}

export default async function subagentsFixture(pi: ExtensionAPI): Promise<void> {
  await assertFixtureWorkspace(process.cwd());
  pi.registerCommand("fixture-reload", {
    description: "Reload the fixture extensions",
    handler: async (_args, ctx) => {
      await ctx.reload();
    }
  });
  pi.registerCommand("fixture-tree", {
    description: "Select a fixture parent entry",
    handler: async (id, ctx) => {
      await ctx.navigateTree(id.trim(), { summarize: false });
    }
  });
  pi.registerCommand("fixture-parent-fork", {
    description: "Fork a fixture parent entry",
    handler: async (id, ctx) => {
      await ctx.fork(id.trim(), { position: "at" });
    }
  });
  let commandStarted: (() => void) | undefined;
  pi.on("agent_start", () => commandStarted?.());
  pi.registerCommand("fixture-run", {
    description: "Start model work from a handled command",
    handler: async () => {
      const started = Promise.withResolvers<void>();
      commandStarted = () => started.resolve();
      pi.sendUserMessage("finite");
      await started.promise;
      commandStarted = undefined;
    }
  });
  let ignoreShutdown = false;
  let answer = false;
  let settleHold = false;
  let exitHold = false;
  let digestCompact = false;
  let digestHold = false;
  let idleWake = false;
  let idleRelease = false;
  pi.events.on(PENDING_RESULT_CHANNEL, () => {
    resultPending = true;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    // Only delivery starts runs with a custom message: the idle wake with background results.
    idleWake = event.messageType === "custom";
    const prompt = event.messageType === "user" ? event.prompt : undefined;
    idleRelease = prompt === "background-idle";
    if (idleRelease) await rm(join(ctx.cwd, IDLE_RELEASE), { force: true });
    digestCompact = prompt === "digest-compact";
    digestHold = prompt === "activity-digest";
    settleHold = prompt === "settle-hold";
    exitHold = prompt === "exit-hold";
    ignoreShutdown = prompt === "ignore-abort" || prompt === "shutdown-blocked";
    if (prompt === "dialog")
      // A shorter limit would decline the dialog when a loaded host answers late.
      answer = await ctx.ui.confirm("Fixture question", "Continue this child task?", {
        timeout: STEP_TIMEOUT_MS
      });
    if (prompt === "selection")
      answer =
        (await ctx.ui.select("Fixture selection", ["Same", "\u001b[31mSame\u001b[0m"])) ===
        "\u001b[31mSame\u001b[0m";

    return { systemPrompt: `${event.systemPrompt}\nSUBAGENTS_PREPARED_CONTEXT` };
  });
  // Hold the saved result so paging starts after the assistant's tool-call entry.
  pi.on("tool_result", async (_event, ctx) => {
    if (!digestHold) return;
    await writeFile(join(ctx.cwd, "digest-ready"), "ready");
    while (!existsSync(join(ctx.cwd, "digest-release"))) await setTimeout(25);
  });
  // pi-subagents loads first, so its `turn_end` handler has run and cannot take the result.
  pi.on("turn_end", async (event, ctx) => {
    if (!idleRelease || event.message.role !== "assistant" || event.message.stopReason !== "stop")
      return;
    idleRelease = false;
    await writeFile(join(ctx.cwd, IDLE_RELEASE), "");
  });
  pi.on("agent_before_settle", async () => {
    if (digestCompact) {
      // The usage of the model request that would write the summary.
      const usage = { ...zeroUsage(), input: 7, output: 3, totalTokens: 10 };
      usage.cost.total = 0.001;

      return {
        entries: [
          {
            type: "compaction",
            summary: "Digest fixture summary",
            firstKeptEntryId: null,
            usage
          }
        ]
      };
    }
  });
  pi.on("agent_settled", async (_event, ctx) => {
    if (!settleHold) return;
    settleHold = false;
    // Pi defers input that arrives during this hook. The hook ends only after the input arrives,
    // so the supervisor sends it before it sees `agent_settled` and cannot collect the run first.
    const input = nextPromptCommand();
    await writeFile(join(ctx.cwd, "settle-ready"), ctx.sessionManager.getSessionId());
    await input;
  });
  pi.on("session_shutdown", async () => {
    if (exitHold) {
      await writeFile(join(process.cwd(), "exit-ready"), "ready");
      await setTimeout(1500);
    }

    // Keep a handle alive as well as ignoring EOF, so the forced-stop path is observable.
    while (ignoreShutdown) await setTimeout(60_000);
  });
  const stream = createStream(
    () => answer,
    () => idleWake
  );
  pi.registerProvider(
    createProvider({
      id: FIXTURE_PROVIDER,
      auth: {
        apiKey: {
          name: "Offline fixture",
          resolve: async () => ({ auth: { apiKey: "offline-fixture" }, source: "fixture" })
        }
      },
      models: [
        {
          id: "scripted",
          name: "Offline subagents fixture",
          api: FIXTURE_PROVIDER,
          provider: FIXTURE_PROVIDER,
          baseUrl: "http://localhost.invalid",
          reasoning: false,
          input: ["text"],
          contextWindow: 200000,
          maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        },
        {
          id: "reasoning",
          name: "Offline subagents reasoning fixture",
          api: FIXTURE_PROVIDER,
          provider: FIXTURE_PROVIDER,
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
