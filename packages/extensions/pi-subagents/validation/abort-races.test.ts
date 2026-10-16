import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  contentText,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseStep,
  type TranscriptContext
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  initTheme,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionFactory
} from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, test as caseTest, vi } from "vite-plus/test";
import { z } from "zod";

import * as invocation from "../src/child/invocation.ts";
import { ChildRun } from "../src/child/run.ts";
import { DEPTH_ENV, RESULT_MESSAGE, TASK_ID_ENV } from "../src/constants.ts";
import type { ChildMessage } from "../src/coordination/protocol.ts";
import { WriterLease } from "../src/history/lease.ts";
import { branchTo } from "../src/history/sessions.ts";
import subagents from "../src/index.ts";
import { detailsSchema } from "../src/result.ts";
import { taskHistory, taskRecordSchema, type TaskRecord } from "../src/tasks/records.ts";
import { Tasks, type TaskEvent } from "../src/tasks/registry.ts";
import { killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

const test = caseTest.skipIf(process.platform !== "linux");
const WAIT_MS = STEP_TIMEOUT_MS;

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), WAIT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function savedResults(session: AgentSession) {
  return session.sessionManager
    .getEntries()
    .flatMap((entry) =>
      entry.type === "custom_message" && entry.customType === RESULT_MESSAGE ? [entry] : []
    );
}

function abortResults(session: AgentSession) {
  return session.sessionManager
    .getEntries()
    .flatMap((entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "subagent_abort"
        ? [entry.message]
        : []
    );
}

function completionCount(context: TranscriptContext): number {
  return context.messages.filter(
    (message) =>
      message.role === "user" &&
      /<summary>Background task (completed|failed|cancelled):/.test(contentText(message.content))
  ).length;
}

function launchCall(prompt: string) {
  return fauxAssistantMessage(
    fauxToolCall("subagent", {
      description: "Abort race fixture",
      prompt,
      model: "subagents-fixture/scripted",
      background: true
    }),
    { stopReason: "toolUse" }
  );
}

type SDKFixture = {
  session: AgentSession;
  /** The first child run of the supervisor. */
  started: Promise<ChildRun>;
  requests: TranscriptContext[];
  queue(...responses: FauxResponseStep[]): void;
  /** Drop the coordination messages from direct children that `drop` matches. */
  intercept(drop: (message: ChildMessage) => boolean): void;
  /** The supervisor's task records from `/subagents list`. */
  records(): Promise<TaskRecord[]>;
};

async function fixture(
  body: (host: SDKFixture) => Promise<void>,
  release: () => void,
  afterSubagents?: ExtensionFactory
): Promise<void> {
  const directory = await createFixtureWorkspace({
    settings: { "ext.pi-subagents": { maxConcurrent: 2, maxDepth: 2 } }
  });
  let session: AgentSession | undefined;

  try {
    const launch = await fixtureLaunch(directory);
    for (const [name, value] of Object.entries(launch.options.env)) vi.stubEnv(name, value);
    vi.stubEnv(DEPTH_ENV, undefined);
    vi.stubEnv(TASK_ID_ENV, undefined);
    vi.spyOn(invocation, "getPiInvocation").mockReturnValue({
      command: launch.command,
      args: [launch.args[0]!]
    });
    const started = Promise.withResolvers<ChildRun>();
    let drop: ((message: ChildMessage) => boolean) | undefined;
    // The spy calls the real method with each run as its receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const listen = ChildRun.prototype.listen;
    vi.spyOn(ChildRun.prototype, "listen").mockImplementation(function (this: ChildRun, listener) {
      started.resolve(this);

      return listen.call(this, (message) => {
        if (!drop?.(message)) listener(message);
      });
    });
    const cwd = launch.options.cwd;
    const agentDir = join(directory, "agent");
    const settingsManager = SettingsManager.inMemory(
      { compaction: { enabled: false }, retry: { enabled: false } },
      { projectTrusted: true }
    );
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noThemes: true,
      noContextFiles: true,
      noPromptTemplates: true,
      extensionFactories: [subagents, ...(afterSubagents ? [afterSubagents] : [])]
    });
    await resourceLoader.reload();
    expect(resourceLoader.getExtensions().errors).toEqual([]);
    const faux = fauxProvider({ provider: "abort-races", models: [{ id: "offline" }] });
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-store.json"),
      refreshOnCreate: false,
      allowModelNetwork: false
    });
    modelRuntime.registerNativeProvider(faux.provider);
    initTheme();
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      settingsManager,
      resourceLoader,
      modelRuntime,
      model: faux.getModel(),
      thinkingLevel: "off",
      sessionManager: SessionManager.inMemory(cwd),
      noTools: "builtin"
    }));
    const errors: unknown[] = [];
    const notes: string[] = [];
    const runner = session.extensionRunner;
    await session.bindExtensions({
      mode: "rpc",
      uiContext: { ...runner.createContext().ui, notify: (message) => notes.push(message) },
      onError: (error) => errors.push(error)
    });
    const requests: TranscriptContext[] = [];
    await body({
      session,
      started: started.promise,
      requests,
      intercept(next) {
        drop = next;
      },
      async records() {
        await runner.getCommand("subagents")!.handler("list", runner.createCommandContext());

        return z.object({ tasks: z.array(taskRecordSchema) }).parse(JSON.parse(notes.at(-1)!))
          .tasks;
      },
      queue(...responses) {
        faux.appendResponses(
          responses.map((response) => async (context, options, state, model) => {
            requests.push(structuredClone(context));

            return typeof response === "function"
              ? response(context, options, state, model)
              : response;
          })
        );
      }
    });
    expect(errors).toEqual([]);
  } finally {
    release();

    try {
      if (session) {
        await bounded(session.abort(), "SDK abort during cleanup");
        await bounded(
          session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }),
          "SDK shutdown"
        );
      }
    } finally {
      session?.dispose();

      try {
        const leaked = await remainingProcesses(directory, 5_000);
        await killFixtureProcesses(directory);
        expect(leaked).toEqual([]);
      } finally {
        await rm(directory, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    }
  }
}

/** Hold each completion at the event seam, so that its release reaches delivery synchronously. */
function holdCompletions() {
  const reached = Promise.withResolvers<Extract<TaskEvent, { kind: "completed" }>>();
  const held: (() => void)[] = [];
  let open = false;
  // The wrapper forwards each listener to its original Tasks instance.
  // oxlint-disable-next-line typescript/unbound-method
  const subscribe = Tasks.prototype.subscribe;
  vi.spyOn(Tasks.prototype, "subscribe").mockImplementation(function (this: Tasks, listener) {
    return subscribe.call(this, (event) => {
      if (event.kind !== "completed" || open) return listener(event);
      held.push(() => listener(event));
      reached.resolve(event);
    });
  });

  return {
    reached: reached.promise,
    release() {
      open = true;
      for (const deliver of held.splice(0)) deliver();
    }
  };
}

// S1/S8: each row cuts a different handoff between completion, agent_end, and abort.
test.each(["release then abort", "abort after end", "release after aborted end"])(
  "retains one background result across %s",
  async (order) => {
    const completion = holdCompletions();
    const ended = Promise.withResolvers<void>();
    const leaveEnd = Promise.withResolvers<void>();
    let session: AgentSession;
    let aborting: Promise<void> | undefined;
    let firstEnd = true;

    const afterSubagents: ExtensionFactory = (pi) => {
      pi.on("agent_end", async (_event, ctx) => {
        if (!firstEnd) return;

        firstEnd = false;
        if (order === "abort after end") aborting = session.abort();

        if (order === "release after aborted end") {
          expect(ctx.signal?.aborted).toBe(true);
          ended.resolve();
          await bounded(leaveEnd.promise, "release after aborted end");
        }
      });
    };

    try {
      await fixture(
        async (host) => {
          session = host.session;
          const consumed = Promise.withResolvers<void>();
          host.queue(
            launchCall("finite"),
            fauxAssistantMessage("Waiting for the child"),
            (context) => {
              expect(completionCount(context)).toBe(1);
              expect(contentText(context.messages.at(-1)!.content)).toContain("Fixture reply");
              consumed.resolve();

              return fauxAssistantMessage("Completion consumed");
            }
          );
          const prompt = session.prompt("Start the finite background task");
          const event = await bounded(completion.reached, "real child completion");
          expect(event.outcome).toBe("completed");
          expect(session.isIdle).toBe(false);

          if (order === "release then abort") {
            completion.release();
            aborting = session.abort();
          } else if (order === "abort after end") completion.release();
          else {
            aborting = session.abort();
            await bounded(ended.promise, "aborted Delivery.end return");
            completion.release();
            leaveEnd.resolve();
          }

          await bounded(consumed.promise, "automatic result consumption without a prompt");
          await bounded(prompt, "initial prompt");
          if (aborting) await bounded(aborting, "turn abort");
          await bounded(session.waitForIdle(), "automatic continuation settlement");
          expect(host.requests.filter((context) => completionCount(context) > 0)).toHaveLength(1);
          expect(savedResults(session)).toHaveLength(1);
          expect(detailsSchema.parse(savedResults(session)[0]!.details).state).toBe("completed");
          const requests = host.requests.length;
          host.queue((context) => {
            expect(completionCount(context)).toBe(1);

            return fauxAssistantMessage("Later explicit reply");
          });
          await bounded(session.prompt("Later explicit prompt"), "later prompt");
          expect(host.requests).toHaveLength(requests + 1);
          expect(savedResults(session)).toHaveLength(1);
        },
        () => {
          completion.release();
          leaveEnd.resolve();
        },
        afterSubagents
      );
    } finally {
      completion.release();
      leaveEnd.resolve();
    }
  }
);

// S9/S1: the process has failed, but a held lease release keeps its managed record active.
test("rejects abort after process exit and retains the real failed completion", async () => {
  const releaseLease = Promise.withResolvers<void>();
  const abortReady = Promise.withResolvers<void>();

  try {
    await fixture(
      async (host) => {
        const consumed = Promise.withResolvers<void>();
        host.queue(
          launchCall("finite-late"),
          async () => {
            await bounded(abortReady.promise, "post-exit abort request");
            const start = await (await host.started).started;

            return fauxAssistantMessage(
              fauxToolCall("subagent_abort", { task_id: start!.taskId }),
              { stopReason: "toolUse" }
            );
          },
          // The task failed before the abort, so its result joins the run when the abort turn ends.
          (context) => {
            expect(completionCount(context)).toBe(1);
            expect(contentText(context.messages.at(-1)!.content)).toContain(
              "Background task failed:"
            );
            consumed.resolve();

            return fauxAssistantMessage("Failure consumed");
          }
        );
        const releasing = Promise.withResolvers<void>();
        // The wrapper releases the real lease after the held window.
        // oxlint-disable-next-line typescript/unbound-method
        const release = WriterLease.prototype.release;
        let held = false;
        vi.spyOn(WriterLease.prototype, "release").mockImplementation(async function (
          this: WriterLease
        ) {
          if (!held) {
            held = true;
            releasing.resolve();
            await bounded(releaseLease.promise, "lease release");
          }

          return release.call(this);
        });
        const prompt = host.session.prompt("Start the late background task");
        const run = await bounded(host.started, "child run creation");
        const id = (await bounded(run.started, "real child launch"))!.taskId;
        const record = async () => (await host.records()).find((item) => item.task_id === id);
        expect(await record()).toMatchObject({ state: "active" });
        expect(run.connection.process.kill("SIGTERM")).toBe(true);
        const exited = await bounded(run.done, "real child failure exit");
        expect(exited.outcome).toBe("failed");
        await bounded(releasing.promise, "held lease release");
        expect(await record()).toMatchObject({ state: "active" });
        // The wrapper cancels the real run, then lets its cleanup finish.
        // oxlint-disable-next-line typescript/unbound-method
        const cancel = ChildRun.prototype.cancel;
        const cancellation = vi.spyOn(ChildRun.prototype, "cancel").mockImplementation(function (
          this: ChildRun,
          reason
        ) {
          const result = cancel.call(this, reason);
          releaseLease.resolve();

          return result;
        });
        abortReady.resolve();
        await vi.waitFor(() => expect(abortResults(host.session)).toHaveLength(1), {
          timeout: WAIT_MS
        });
        const result = abortResults(host.session)[0]!;
        expect(cancellation).toHaveBeenCalledTimes(1);
        expect(result.isError).toBe(true);
        expect(contentText(result.content)).toContain("Task is inactive");
        expect(detailsSchema.safeParse(result.details).data?.state).not.toBe("cancelled");
        await bounded(consumed.promise, "failed background result consumption");
        await bounded(prompt, "post-exit prompt settlement");
        expect(await record()).toMatchObject({ state: "inactive", outcome: "failed" });
        expect(savedResults(host.session)).toHaveLength(1);
        expect(detailsSchema.parse(savedResults(host.session)[0]!.details).state).toBe("failed");
        expect(contentText(savedResults(host.session)[0]!.content)).toContain(exited.text);
      },
      () => {
        releaseLease.resolve();
        abortReady.resolve();
      }
    );
  } finally {
    releaseLease.resolve();
    abortReady.resolve();
  }
});

// S9: the owner confirms cancellation, then rejects a stale ancestor's second abort.
test("confirms descendant cancellation and propagates the owner's inactive error", async () => {
  const abortTarget = Promise.withResolvers<string>();
  const staleTarget = Promise.withResolvers<string>();

  try {
    await fixture(
      async (host) => {
        host.queue(
          launchCall("owner-linger-abort"),
          async () =>
            fauxAssistantMessage(
              fauxToolCall("subagent_abort", {
                task_id: await bounded(abortTarget.promise, "active descendant target")
              }),
              { stopReason: "toolUse" }
            ),
          async () =>
            fauxAssistantMessage(
              fauxToolCall("subagent_abort", {
                task_id: await bounded(staleTarget.promise, "inactive descendant target")
              }),
              { stopReason: "toolUse" }
            ),
          fauxAssistantMessage("Descendant abort result received"),
          fauxAssistantMessage("Owner completion consumed")
        );
        const active = Promise.withResolvers<TaskRecord>();
        let stale: string | undefined;
        // The owner sends the descendant's end before its abort confirmation. Dropping that
        // record leaves the supervisor with a stale active descendant.
        host.intercept((message) => {
          if (message.kind !== "task") return false;

          if (message.record.state === "active" && stale === undefined) {
            stale = message.record.task_id;
            active.resolve(message.record);
          }

          return message.record.task_id === stale && message.record.state === "inactive";
        });
        const prompt = host.session.prompt("Start the background owner");
        const owner = await bounded(host.started, "owner creation");
        const ownerId = (await bounded(owner.started, "owner launch"))!.taskId;
        const record = async (id: string) =>
          (await host.records()).find((item) => item.task_id === id);
        const descendant = await bounded(active.promise, "active descendant relay");
        expect(descendant.parent_task_id).toBe(ownerId);
        abortTarget.resolve(descendant.task_id);
        await vi.waitFor(() => expect(abortResults(host.session)).toHaveLength(1), {
          timeout: WAIT_MS,
          interval: 10
        });
        const confirmed = abortResults(host.session)[0]!;
        expect(confirmed.isError).toBe(false);
        expect(detailsSchema.parse(confirmed.details)).toMatchObject({
          task_id: descendant.task_id,
          state: "cancelled"
        });

        const history = async (label: string) => {
          const snapshot = await bounded(owner.entries(), label);

          return taskHistory(branchTo(snapshot.entries, snapshot.leafId), ownerId).get(
            descendant.task_id
          );
        };

        const before = await history("owner's inactive descendant record");
        expect(before).toMatchObject({
          state: "inactive",
          outcome: "cancelled"
        });
        expect(await record(descendant.task_id)).toMatchObject({ state: "active" });
        expect(await record(ownerId)).toMatchObject({ state: "active" });
        expect(owner.connection.process.exitCode).toBeNull();
        staleTarget.resolve(descendant.task_id);
        await vi.waitFor(() => expect(abortResults(host.session)).toHaveLength(2), {
          timeout: WAIT_MS,
          interval: 10
        });
        const result = abortResults(host.session)[1]!;
        expect(result.isError).toBe(true);
        expect(contentText(result.content)).toContain("Task is inactive");
        expect(detailsSchema.safeParse(result.details).data?.state).not.toBe("cancelled");
        expect(await history("unchanged descendant in the real owner")).toEqual(before);
        expect(await record(ownerId)).toMatchObject({ state: "active" });
        await bounded(prompt, "owner completion settlement");
        expect(savedResults(host.session)).toHaveLength(1);
        expect(contentText(savedResults(host.session)[0]!.content)).toContain(
          "Cancelled by supervisor"
        );
      },
      () => {
        abortTarget.resolve("00000000-0000-0000-0000-000000000000");
        staleTarget.resolve("00000000-0000-0000-0000-000000000000");
      }
    );
  } finally {
    abortTarget.resolve("00000000-0000-0000-0000-000000000000");
    staleTarget.resolve("00000000-0000-0000-0000-000000000000");
  }
});
