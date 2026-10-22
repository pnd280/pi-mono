import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { useStepPatchDeadline } from "@pi-mono/libs/validation/bounded-diff";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import { RunChanges } from "./changes.ts";
import { counterChannel } from "./counters.ts";
import agentSummary from "./index.ts";
import { milestoneChannel } from "./milestones.ts";
import { summaryEntryType } from "./summary.ts";

it("saves one summary per settled run and none for a run that reload or shutdown interrupts", async () => {
  useStepPatchDeadline();
  // Only the live timer's interval is fake, so the timer count shows whether it still ticks.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let helper: ExtensionAPI | undefined;
  let duringShutdown: (() => Promise<void>) | undefined;
  let settledRuns = 0;
  const fixture = await hostFixture([
    agentSummary,
    (pi) => {
      helper = pi;
      // Loaded after pi-agent-summary, like another extension whose cleanup awaits during shutdown.
      pi.on("session_shutdown", async () => {
        const action = duringShutdown;
        duringShutdown = undefined;
        await action?.();
      });
      pi.on("agent_settled", () => {
        settledRuns++;
      });
    }
  ]);
  const { session } = fixture;
  const releases: (() => void)[] = [];
  const settlements: Promise<unknown>[] = [];
  const finish = vi.spyOn(RunChanges.prototype, "finish");
  let disposed = false;

  const summaries = () =>
    session.sessionManager
      .getBranch()
      .flatMap((entry) =>
        entry.type === "custom" && entry.customType === summaryEntryType ? [entry.data] : []
      );

  const start = (text: string) => {
    const prompt = session.prompt(text);
    settlements.push(Promise.allSettled([prompt]));

    return prompt;
  };

  const settled = (count: number) =>
    vi.waitFor(() => expect(settledRuns).toBe(count), { timeout: STEP_TIMEOUT_MS });

  const held = (during = () => {}) => {
    let entered = false;
    const release = Promise.withResolvers<void>();
    releases.push(release.resolve);

    const response: FauxResponseFactory = async (_context, options) => {
      options?.signal?.addEventListener("abort", () => release.resolve(), { once: true });
      during();
      entered = true;
      await release.promise;

      return fauxAssistantMessage("Held response");
    };

    return {
      response,
      entered: () => vi.waitFor(() => expect(entered).toBe(true), { timeout: STEP_TIMEOUT_MS }),
      release: release.resolve
    };
  };

  const summary = (fields: Record<string, unknown>) => ({
    durationMs: expect.any(Number) as unknown,
    finishedAt: expect.any(Number) as unknown,
    models: [{ provider: "summary-lifecycle", id: "offline", thinkingLevel: "off" }],
    throughput: {
      outputTokens: expect.any(Number) as unknown,
      durationMs: expect.any(Number) as unknown
    },
    bashCalls: 0,
    files: [],
    ...fields
  });

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "summary-lifecycle", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.setModel(faux.getModel());
    session.setThinkingLevel("off");
    session.settingsManager.applyOverrides({ retry: { baseDelayMs: 1 } });

    // A retried, multi-turn run saves one summary at settlement and stops its timer.
    const first = held(() => {
      helper?.events.emit(milestoneChannel, { text: "Published v1.2.0" });
      helper?.events.emit(counterChannel, {
        id: "tasks",
        verb: "delegated",
        singular: "task",
        plural: "tasks"
      });
    });
    faux.setResponses([
      fauxAssistantMessage([], { stopReason: "error", errorMessage: "503 overloaded" }),
      fauxAssistantMessage(fauxToolCall("write", { path: "first.txt", content: "first\n" })),
      first.response
    ]);
    const firstPrompt = start("First run");
    await first.entered();
    expect(vi.getTimerCount()).toBe(1);
    first.release();
    await firstPrompt;
    expect(vi.getTimerCount()).toBe(0);
    expect(summaries()).toEqual([
      summary({
        milestones: ["Published v1.2.0"],
        counters: [{ id: "tasks", verb: "delegated", singular: "task", plural: "tasks", count: 1 }],
        files: [{ path: "first.txt", status: "available", added: 1, removed: 0 }]
      })
    ]);

    // The next run starts without the settled run's statistics.
    faux.setResponses([fauxAssistantMessage("Second response")]);
    await start("Second run");
    expect(summaries()).toHaveLength(2);
    expect(summaries()[1]).toEqual(summary({}));

    // Reload while the net comparison is pending; the comparison finishes during shutdown.
    const pending = Promise.withResolvers<Awaited<ReturnType<RunChanges["finish"]>>>();
    finish.mockReturnValueOnce(pending.promise);
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("write", { path: "third.txt", content: "third\n" })),
      fauxAssistantMessage("Third response")
    ]);
    const thirdPrompt = start("Third run");
    await vi.waitFor(() => expect(finish).toHaveBeenCalledTimes(3), { timeout: STEP_TIMEOUT_MS });

    duringShutdown = async () => {
      pending.resolve([{ path: "third.txt", status: "available", added: 1, removed: 0 }]);
      await settled(3);
    };

    await session.reload();
    await thirdPrompt;
    expect(summaries()).toHaveLength(2);

    // Another extension starts a run during shutdown, before the reloaded session starts.
    faux.setResponses([fauxAssistantMessage("Late response")]);

    duringShutdown = async () => {
      helper?.sendUserMessage("Late run");
      await settled(4);
    };

    await session.reload();
    expect(session.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Late response" }]
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(summaries()).toHaveLength(2);

    // After the reset, a run saves only its own statistics.
    faux.setResponses([fauxAssistantMessage("Fourth response")]);
    await start("Fourth run");
    expect(summaries()).toHaveLength(3);
    expect(summaries()[2]).toEqual(summary({}));

    // Shutdown stops the live timer, and the run that settles during shutdown saves no summary.
    const last = held();
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("write", { path: "last.txt", content: "last\n" })),
      last.response
    ]);
    void start("Interrupted run");
    await last.entered();
    expect(vi.getTimerCount()).toBe(1);

    duringShutdown = async () => {
      last.release();
      await settled(6);
    };

    disposed = true;
    await fixture.dispose();
    expect(session.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Held response" }]
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(summaries()).toHaveLength(3);
  } finally {
    try {
      if (!disposed) await fixture.dispose();
    } finally {
      for (const release of releases) release();
      await Promise.all(settlements);
      finish.mockRestore();
      vi.useRealTimers();
    }
  }
});
