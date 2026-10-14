import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
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

type Call = {
  /** The called tool; `subagent` when omitted. */
  tool?: "subagent_abort";
  description: string;
  prompt: string;
  task_id?: string;
  model?: string;
  thinking?: string;
  background?: boolean;
  delivery?: "steer" | "follow_up";
};

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
  const continuation = continuationPlan(scenario) ?? selectionPlan(scenario);
  if (continuation) return continuation;
  if (scenario === "failure-then-reply")
    return supervisorPlan(completed === 0 ? "delegate-launch-error" : "delegate-reply");
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
    ["background-idle", "finite"],
    ["background-busy", "finite"],
    ["background-late", "finite-late"],
    ["background-error", "finite"],
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
    ["delegate-tools", "report-tools"]
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

function planCall({ tool, ...args }: Call, id: string) {
  const arguments_: JsonObject =
    tool === "subagent_abort" ? { task_id: args.task_id ?? "" } : { ...args };

  return fauxToolCall(tool ?? "subagent", arguments_, { id });
}

/** A final reply without results fails: once without retry, or once with a retryable error. */
function failFinalReply(scenario: string, completions: number): void {
  if (scenario === "background-error" && !completions) throw new Error("Fixture provider error");

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

  return ["reply", "finite", "finite-late", "shutdown-blocked"].includes(scenario)
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
      if (candidate?.role === "user" && !contentText(candidate.content).includes("<task")) break;
      userIndex--;
    }

    const user = context.messages[userIndex];
    const prompt = user?.role === "user" ? contentText(user.content).trim() : "";
    const scenario = idleWake() ? "idle-wake" : prompt;
    const plannedSteps = scenario === "failure-then-reply" ? 2 : 1;
    const pauseAfterPlan = ["background-busy", "owner-linger", "owner-linger-abort"].includes(
      scenario
    );
    const activityDelay = ["activity-promote", "activity-digest"].includes(scenario) ? 4000 : 1200;
    const delay = new Map([
      ["finite", 1500],
      ["finite-late", 4000],
      ["input-hold", 3000]
    ]).get(scenario);
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
                /<summary>Background task (completed|failed|cancelled):/.test(
                  contentText(item.content)
                )
            );
            if (pauseAfterPlan && !completions.length)
              await setTimeout(3000, undefined, { signal });
            failFinalReply(scenario, completions.length);
            text(
              `Supervisor finished; background results ${completions.length}\n${results.map((item) => contentText(item.content)).join("\n")}\n${completions.map((item) => contentText(item.content)).join("\n")}`
            );

            return "stop";
          }

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

        if (delay !== undefined) await setTimeout(delay, undefined, { signal });

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
  pi.on("before_agent_start", async (event, ctx) => {
    // Only delivery starts runs with a custom message: the idle wake with background results.
    idleWake = event.messageType === "custom";
    const prompt = event.messageType === "user" ? event.prompt : undefined;
    digestCompact = prompt === "digest-compact";
    digestHold = prompt === "activity-digest";
    settleHold = prompt === "settle-hold";
    exitHold = prompt === "exit-hold";
    ignoreShutdown = prompt === "ignore-abort" || prompt === "shutdown-blocked";
    if (prompt === "dialog")
      answer = await ctx.ui.confirm("Fixture question", "Continue this child task?", {
        timeout: 10_000
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
    await writeFile(join(ctx.cwd, "settle-ready"), ctx.sessionManager.getSessionId());
    await setTimeout(3000);
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
