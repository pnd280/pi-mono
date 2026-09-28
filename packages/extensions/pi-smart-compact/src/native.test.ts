import assert from "node:assert/strict";

import { AgentSession } from "@earendil-works/pi-coding-agent";
import { it } from "vite-plus/test";

import { bindNativeCompaction } from "./native.ts";

const boundary = "_compactBeforeNextAssistantResponse";
const context = { messages: ["before"] };

async function invoke(receiver: object) {
  const method: unknown = Reflect.get(AgentSession.prototype, boundary);
  if (typeof method !== "function") throw new Error("Missing boundary");
  const result: unknown = await Reflect.apply(method, receiver, [context]);

  return result;
}

it("scopes and consumes requests, clears abandoned requests, and restores the boundary", async () => {
  const prototype = AgentSession.prototype;
  const original: unknown = Reflect.get(prototype, boundary);
  const originalSummary: unknown = Reflect.get(prototype, "_runDefaultCompaction");
  const managerA = {
    buildSessionProjection: () => ({ messages: ["compacted"] }),
    getBranch: () => []
  };
  const managerB = { buildSessionProjection: () => context, getBranch: () => [] };
  const a = bindNativeCompaction(managerA);
  const b = bindNativeCompaction(managerB);
  let forcedCalls = 0;
  let fail = false;
  let listeners = 0;
  const outcomes: unknown[] = [];
  const session = {
    sessionManager: managerA,
    model: { contextWindow: 0 },
    subscribe() {
      listeners++;

      return () => listeners--;
    },
    _appendCustomMessage(message: unknown) {
      outcomes.push(message);
    },
    settingsManager: { getCompactionSettings: () => ({ enabled: false }) },
    _agentRunAbortRequested: false,
    async _runAutoCompaction(reason: string, willRetry: boolean) {
      assert.equal(reason, "manual");
      assert.equal(willRetry, false);
      forcedCalls++;
      if (fail) throw new Error("Native failure");

      return false;
    }
  };

  try {
    assert.throws(() => bindNativeCompaction(managerA), /already bound/);
    a.request("superseded focus");
    a.request();
    assert.deepEqual(await invoke({ ...session, sessionManager: managerB }), context);
    assert.equal(forcedCalls, 0);
    assert.deepEqual(await invoke(session), { messages: ["compacted"] });
    assert.equal(forcedCalls, 1);
    assert.equal(listeners, 0);
    assert.partialDeepStrictEqual(outcomes, [
      { details: { status: "skipped", reason: "Pi did not start compaction." } }
    ]);
    await invoke(session);
    assert.equal(forcedCalls, 1);
    const controller = new AbortController();
    a.request("discarded", controller.signal);
    controller.abort();
    assert.equal(await invoke(session), context);
    assert.equal(forcedCalls, 1);
    assert.throws(() => a.request(undefined, controller.signal), /abort/i);
    a.request();
    assert.equal(await invoke({ ...session, _agentRunAbortRequested: true }), context);
    await invoke(session);
    assert.equal(forcedCalls, 1);
    a.request("discarded");
    a.clear();
    await invoke(session);
    assert.equal(forcedCalls, 1);
    fail = true;
    a.request();
    await assert.rejects(invoke(session), /Native failure/);
    await invoke(session);
    assert.equal(forcedCalls, 2);
    assert.equal(listeners, 0);
    assert.equal(outcomes.length, 1);
    a.dispose();
    fail = false;
    b.request();
    assert.deepEqual(await invoke({ ...session, sessionManager: managerB }), context);
    assert.equal(forcedCalls, 3);
    assert.partialDeepStrictEqual(outcomes.at(-1), {
      details: { status: "skipped", reason: "Pi did not start compaction." }
    });
    b.dispose();
    assert.equal(Reflect.get(prototype, boundary), original);
    assert.equal(Reflect.get(prototype, "_runDefaultCompaction"), originalSummary);
    assert.throws(() => a.request(), /disposed/);
  } finally {
    a.dispose();
    b.dispose();
  }
});

it("does not misdiagnose native preparation errors as a small session", async () => {
  const nativeRun: unknown = Reflect.get(AgentSession.prototype, "_runAutoCompaction");
  assert.equal(typeof nativeRun, "function");
  let branchReads = 0;
  let preparationFailed = false;
  const manager = {
    buildSessionProjection: () => context,
    getBranch() {
      if (++branchReads === 2) {
        preparationFailed = true;
        throw new Error("Unreadable session branch");
      }

      return [];
    }
  };
  const binding = bindNativeCompaction(manager);
  const outcomes: unknown[] = [];
  const session = {
    sessionManager: manager,
    model: { contextWindow: 0 },
    settingsManager: { getCompactionSettings: () => ({ enabled: false }) },
    subscribe: () => () => {},
    _runAutoCompaction: nativeRun,
    _resolveIdleWaitIfIdle() {},
    _appendCustomMessage(message: unknown) {
      outcomes.push(message);
    }
  };

  try {
    binding.request();
    assert.deepEqual(await invoke(session), context);
    assert.equal(preparationFailed, true);
    assert.partialDeepStrictEqual(outcomes, [
      { details: { status: "skipped", reason: "Pi did not start compaction." } }
    ]);
  } finally {
    binding.dispose();
  }
});

it("does not let a diagnostic branch read bypass native preparation error handling", async () => {
  const nativeRun: unknown = Reflect.get(AgentSession.prototype, "_runAutoCompaction");
  assert.equal(typeof nativeRun, "function");
  const manager = {
    buildSessionProjection: () => context,
    getBranch() {
      throw new Error("Unreadable session branch");
    }
  };
  const binding = bindNativeCompaction(manager);
  const outcomes: unknown[] = [];

  try {
    binding.request();
    assert.deepEqual(
      await invoke({
        sessionManager: manager,
        model: { contextWindow: 0 },
        settingsManager: { getCompactionSettings: () => ({ enabled: false }) },
        subscribe: () => () => {},
        _runAutoCompaction: nativeRun,
        _resolveIdleWaitIfIdle() {},
        _appendCustomMessage(message: unknown) {
          outcomes.push(message);
        }
      }),
      context
    );
    assert.partialDeepStrictEqual(outcomes, [
      { details: { status: "skipped", reason: "Pi did not start compaction." } }
    ]);
  } finally {
    binding.dispose();
  }
});

it.each([boundary, "_appendCustomMessage", "_runDefaultCompaction", "compact"])(
  "rejects unknown %s implementations without replacing them",
  (method) => {
    const prototype = AgentSession.prototype;
    const original: unknown = Reflect.get(prototype, method);
    const unknown = async () => context;
    Reflect.set(prototype, method, unknown);

    try {
      assert.throws(
        () => bindNativeCompaction({}),
        /unsupported version or conflicting runtime patch/
      );
      assert.equal(Reflect.get(prototype, method), unknown);
    } finally {
      Reflect.set(prototype, method, original);
    }
  }
);

it("rolls back the boundary if the summary router cannot be installed", () => {
  const prototype = AgentSession.prototype;
  const original: unknown = Reflect.get(prototype, boundary);
  const summary = Object.getOwnPropertyDescriptor(prototype, "_runDefaultCompaction");
  assert.ok(summary);
  Object.defineProperty(prototype, "_runDefaultCompaction", { ...summary, writable: false });

  try {
    assert.throws(() => bindNativeCompaction({}), /writable data properties/);
    assert.equal(Reflect.get(prototype, boundary), original);
  } finally {
    Object.defineProperty(prototype, "_runDefaultCompaction", summary);
  }
});

it("does not publish an outcome after its session binding is disposed", async () => {
  const manager = { buildSessionProjection: () => context, getBranch: () => [] };
  const binding = bindNativeCompaction(manager);
  let subscribed = false;

  try {
    binding.request();
    await invoke({
      sessionManager: manager,
      model: { contextWindow: 0 },
      subscribe() {
        subscribed = true;

        return () => {
          subscribed = false;
        };
      },
      async _runAutoCompaction() {
        binding.dispose();

        return false;
      },
      _appendCustomMessage() {
        assert.fail("Disposed bindings must not report to the session");
      }
    });
    assert.equal(subscribed, false);
  } finally {
    binding.dispose();
  }
});

it.each([boundary, "_runDefaultCompaction"])(
  "does not overwrite a later %s wrapper and restores ownership after it is removed",
  (method) => {
    const prototype = AgentSession.prototype;
    const original: unknown = Reflect.get(prototype, method);
    const binding = bindNativeCompaction({});
    const wrapper: unknown = Reflect.get(prototype, method);
    const foreign = async () => context;
    Reflect.set(prototype, method, foreign);
    let next: ReturnType<typeof bindNativeCompaction> | undefined;

    try {
      binding.dispose();
      assert.equal(Reflect.get(prototype, method), foreign);
      assert.throws(() => bindNativeCompaction({}), /another extension replaced/);
      Reflect.set(prototype, method, wrapper);
      next = bindNativeCompaction({});
      next.dispose();
      assert.equal(Reflect.get(prototype, method), original);
    } finally {
      if (Reflect.get(prototype, method) !== original) {
        Reflect.set(prototype, method, wrapper);
        next?.dispose();
        // Restore through a fresh binding if an assertion interrupted cleanup.
        if (Reflect.get(prototype, method) !== original) bindNativeCompaction({}).dispose();
      }
    }
  }
);
