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
import { expect, test as caseTest, vi } from "vite-plus/test";

import { ChildRun } from "../src/child.ts";
import { DEPTH_ENV, RESULT_MESSAGE, TASK_ID_ENV } from "../src/constants.ts";
import subagents from "../src/index.ts";
import * as invocation from "../src/invocation.ts";
import { rebuildOwnership, type TaskRecord } from "../src/records.ts";
import { detailsSchema } from "../src/result.ts";
import { Tasks, type ManagedTask, type TaskEvent } from "../src/tasks.ts";
import { killFixtureProcesses, remainingProcesses } from "./processes.ts";
import { createFixtureWorkspace, fixtureLaunch } from "./workspace.ts";

const test = caseTest.skipIf(process.platform !== "linux");
const WAIT_MS = 15_000;

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
  started: Promise<{ tasks: Tasks; task: ManagedTask }>;
  requests: TranscriptContext[];
  queue(...responses: FauxResponseStep[]): void;
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
    const started = Promise.withResolvers<{ tasks: Tasks; task: ManagedTask }>();
    // The spy calls the real method with each Tasks instance as its receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const start = Tasks.prototype.start;
    vi.spyOn(Tasks.prototype, "start").mockImplementation(function (this: Tasks, ...args) {
      const task = start.apply(this, args);
      started.resolve({ tasks: this, task });

      return task;
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
    await session.bindExtensions({ mode: "rpc", onError: (error) => errors.push(error) });
    const requests: TranscriptContext[] = [];
    await body({
      session,
      started: started.promise,
      requests,
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
          expect(event.result.outcome).toBe("completed");
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
  },
  45_000
);

// S9/S1: the process has failed, but a held capture keeps its managed record active.
test("rejects abort after process exit and retains the real failed completion", async () => {
  const releaseCapture = Promise.withResolvers<void>();
  const abortReady = Promise.withResolvers<void>();

  try {
    await fixture(
      async (host) => {
        const consumed = Promise.withResolvers<void>();
        host.queue(
          launchCall("finite-late"),
          async () => {
            await bounded(abortReady.promise, "post-exit abort request");
            const { task } = await host.started;

            return fauxAssistantMessage(
              fauxToolCall("subagent_abort", { task_id: task.details.task_id! }),
              { stopReason: "toolUse" }
            );
          },
          fauxAssistantMessage("Abort result received"),
          (context) => {
            expect(completionCount(context)).toBe(1);
            expect(contentText(context.messages.at(-1)!.content)).toContain(
              "Background task failed:"
            );
            consumed.resolve();

            return fauxAssistantMessage("Failure consumed");
          }
        );
        const prompt = host.session.prompt("Start the late background task");
        const { tasks, task } = await bounded(host.started, "managed task creation");
        await bounded(task.run.started, "real child launch");
        const id = task.details.task_id!;
        expect(tasks.owned(id).state).toBe("active");
        const captured = Promise.withResolvers<void>();
        const request = task.run.connection.request.bind(task.run.connection);
        let collectedText = false;
        let collectionReadsFinished = false;
        vi.spyOn(task.run.connection, "request").mockImplementation(async (command) => {
          const response = await request(command);
          if (command.type === "get_last_assistant_text") collectedText = true;
          if (command.type === "get_session_stats" && collectedText) collectionReadsFinished = true;

          return response;
        });
        // The wrapper reads the real snapshot from the intercepted ChildRun instance.
        // oxlint-disable-next-line typescript/unbound-method
        const snapshot = ChildRun.prototype.snapshot;
        let held = false;
        vi.spyOn(ChildRun.prototype, "snapshot").mockImplementation(async function (
          this: ChildRun
        ) {
          // Hold collection's last capture, after earlier event captures have drained.
          const finalCapture = this === task.run && collectionReadsFinished && !held;
          const value = await snapshot.call(this);

          if (
            finalCapture &&
            value.entries.some(
              (entry) =>
                entry.type === "message" &&
                entry.message.role === "assistant" &&
                entry.message.stopReason === "stop"
            )
          ) {
            held = true;
            captured.resolve();
            await bounded(releaseCapture.promise, "capture release");
          }

          return value;
        });
        await bounded(captured.promise, "final child capture");
        expect(task.run.connection.process.kill("SIGTERM")).toBe(true);
        const exited = await bounded(task.run.done, "real child failure exit");
        expect(exited.outcome).toBe("failed");
        expect(tasks.active(id)).toBe(task);
        expect(tasks.owned(id).state).toBe("active");
        const cancel = task.run.cancel.bind(task.run);
        const cancellation = vi.spyOn(task.run, "cancel").mockImplementation((reason) => {
          const result = cancel(reason);
          releaseCapture.resolve();

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
        expect(tasks.owned(id)).toMatchObject({ state: "inactive", outcome: "failed" });
        expect(savedResults(host.session)).toHaveLength(1);
        expect(detailsSchema.parse(savedResults(host.session)[0]!.details).state).toBe("failed");
        expect(contentText(savedResults(host.session)[0]!.content)).toContain(exited.text);
      },
      () => {
        releaseCapture.resolve();
        abortReady.resolve();
      }
    );
  } finally {
    releaseCapture.resolve();
    abortReady.resolve();
  }
}, 45_000);

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
        const prompt = host.session.prompt("Start the background owner");
        const { tasks, task } = await bounded(host.started, "owner creation");
        const active = Promise.withResolvers<TaskRecord>();
        const unsubscribe = tasks.subscribe(() => {
          const descendant = tasks
            .list()
            .find(
              (record) =>
                record.parent_task_id === task.details.task_id && record.state === "active"
            );
          if (descendant) active.resolve({ ...descendant });
        });

        try {
          const stale = await bounded(active.promise, "active descendant relay");
          abortTarget.resolve(stale.task_id);
          await vi.waitFor(() => expect(abortResults(host.session)).toHaveLength(1), {
            timeout: WAIT_MS,
            interval: 10
          });
          const confirmed = abortResults(host.session)[0]!;
          expect(confirmed.isError).toBe(false);
          expect(detailsSchema.parse(confirmed.details)).toMatchObject({
            task_id: stale.task_id,
            state: "cancelled"
          });
          await vi.waitFor(() => expect(tasks.owned(stale.task_id).state).toBe("inactive"), {
            timeout: WAIT_MS,
            interval: 10
          });
          const before = await bounded(task.run.snapshot(), "owner's inactive descendant record");
          expect(rebuildOwnership(before.entries).tasks.get(stale.task_id)).toMatchObject({
            state: "inactive",
            outcome: "cancelled"
          });
          expect(tasks.owned(task.details.task_id!).state).toBe("active");
          expect(task.run.connection.process.exitCode).toBeNull();
          const owned = tasks.owned.bind(tasks);
          const lookup = vi
            .spyOn(tasks, "owned")
            .mockImplementation((id) => (id === stale.task_id ? stale : owned(id)));
          staleTarget.resolve(stale.task_id);
          await vi.waitFor(() => expect(abortResults(host.session)).toHaveLength(2), {
            timeout: WAIT_MS,
            interval: 10
          });
          lookup.mockRestore();
          const result = abortResults(host.session)[1]!;
          expect(result.isError).toBe(true);
          expect(contentText(result.content)).toContain("Task is inactive");
          expect(detailsSchema.safeParse(result.details).data?.state).not.toBe("cancelled");
          const after = await bounded(
            task.run.snapshot(),
            "unchanged descendant in the real owner"
          );
          expect(rebuildOwnership(after.entries).tasks.get(stale.task_id)).toEqual(
            rebuildOwnership(before.entries).tasks.get(stale.task_id)
          );
          expect(tasks.owned(task.details.task_id!).state).toBe("active");
          await bounded(prompt, "owner completion settlement");
          expect(savedResults(host.session)).toHaveLength(1);
          expect(contentText(savedResults(host.session)[0]!.content)).toContain(
            "Cancelled by supervisor"
          );
        } finally {
          unsubscribe();
        }
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
}, 45_000);
