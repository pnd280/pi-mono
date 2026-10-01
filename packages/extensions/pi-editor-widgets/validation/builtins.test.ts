import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { createFixtureMessage, zeroUsage } from "@pi-mono/libs/validation/provider";
import { expect, it, vi } from "vite-plus/test";

import { builtinText, formatCwd } from "../src/builtins.ts";

const model = {
  baseUrl: "https://fixture.invalid",
  api: "openai-completions" as const,
  provider: "fixture",
  id: "reasoning",
  name: "Fixture",
  reasoning: true,
  input: ["text" as const],
  contextWindow: 1000,
  maxTokens: 1000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
};
const usage = () => ({
  ...zeroUsage(),
  input: 100,
  output: 10,
  cacheRead: 900,
  cacheWrite: 50,
  totalTokens: 1060,
  cost: { ...zeroUsage().cost, total: 1.25 }
});

it.each(["regular", "compact", "verbose"] as const)(
  "uses native totals and latest-prompt cache hit in %s display",
  async (display) => {
    const fixture = await hostFixture();
    const { session, host, ui } = fixture;
    const manager = session.sessionManager;
    const read = () =>
      stripTerminalSequences(
        builtinText(session, host.footerDataProvider, ui.theme, { tokensDisplay: display }).get(
          "builtin:tokens"
        ) ?? ""
      );

    try {
      session.agent.state.model = model;
      const first = { ...createFixtureMessage(model, 1), usage: usage() };
      const firstId = manager.appendMessage(first);
      manager.appendMessage({
        role: "toolResult",
        toolCallId: "call",
        toolName: "fixture",
        content: [],
        isError: false,
        timestamp: 2,
        usage: usage()
      });
      manager.appendUsage("other", model.provider, model.id, usage());
      manager.appendCompaction("summary", firstId, 1000, undefined, false, usage());
      manager.branchWithSummary(firstId, "branch", undefined, false, usage());
      const latest = createFixtureMessage(model, 3);
      latest.usage = {
        ...zeroUsage(),
        input: 10,
        output: 1,
        cacheRead: 990,
        totalTokens: 1001,
        cost: { ...zeroUsage().cost, total: 0.125 }
      };
      manager.appendMessage(latest);
      expect(read()).toBe(
        display === "compact" ? "↑510 ↓51" : "↑510 ↓51 R5.5k W250 CH99.0% $6.375"
      );
      session.agent.state.model = { ...model, provider: "kimi-coding" };
      expect(read()).toBe(
        display === "compact" ? "↑510 ↓51" : "↑510 ↓51 R5.5k W250 CH99.0% $6.375 (sub)"
      );
      const subscription = vi
        .spyOn(session.modelRuntime, "isUsingSubscription")
        .mockReturnValue(true);
      session.agent.state.model = model;
      expect(read()).toBe(
        display === "compact" ? "↑510 ↓51" : "↑510 ↓51 R5.5k W250 CH99.0% $6.375 (sub)"
      );
      subscription.mockRestore();
    } finally {
      await fixture.dispose();
    }
  }
);

it.each([
  [0, 0, ""],
  [100, 0, "↑100"],
  [0, 10, "↓10"]
] as const)(
  "omits zero counters and all other token details for compact input=%i output=%i",
  async (input, output, expected) => {
    const fixture = await hostFixture();
    const { session, host, ui } = fixture;
    const read = (display: "compact" | "verbose") =>
      stripTerminalSequences(
        builtinText(session, host.footerDataProvider, ui.theme, { tokensDisplay: display }).get(
          "builtin:tokens"
        ) ?? ""
      );

    try {
      expect(read("compact")).toBe("");
      session.agent.state.model = { ...model, provider: "kimi-coding" };
      const message = createFixtureMessage(model, 1);
      message.usage = { ...usage(), input, output, totalTokens: input + output + 950 };
      session.sessionManager.appendMessage(message);
      expect(read("compact")).toBe(expected);
      const verbose = read("verbose");
      expect(verbose).toContain("R900 W50 CH");
      expect(verbose).toContain("$1.250 (sub)");
      expect(
        stripTerminalSequences(
          builtinText(session, host.footerDataProvider, ui.theme).get("builtin:tokens") ?? ""
        )
      ).toBe(verbose);
    } finally {
      await fixture.dispose();
    }
  }
);

it.each(["regular", "compact", "verbose"] as const)(
  "reports known and unknown context usage in %s display",
  async (display) => {
    const fixture = await hostFixture();
    const { session, host, ui } = fixture;
    const read = () =>
      builtinText(session, host.footerDataProvider, ui.theme, { contextDisplay: display }).get(
        "builtin:context"
      );
    const reserve = vi
      .spyOn(session.settingsManager, "getCompactionReserveTokens")
      .mockReturnValue(200);

    try {
      session.agent.state.model = model;
      session.setAutoCompactionEnabled(false);
      expect(stripTerminalSequences(read() ?? "")).toBe(
        display === "compact" ? "0/1.0k" : "0/1.0k (0.0%)"
      );

      for (const [input, text] of [
        [750, display === "compact" ? "750/1.0k" : "750/1.0k (75.0%)"],
        [950, display === "compact" ? "950/1.0k" : "950/1.0k (95.0%)"]
      ] as const) {
        const message = createFixtureMessage(model, input);
        message.usage = { ...zeroUsage(), input, totalTokens: input };
        session.sessionManager.appendMessage(message);
        expect(stripTerminalSequences(read() ?? "")).toBe(text);
      }

      session.setAutoCompactionEnabled(true);
      expect(stripTerminalSequences(read() ?? "")).toBe(
        {
          regular: "950/1.0k (95.0%) (auto)",
          compact: "950/1.0k (auto)",
          verbose: "950/1.0k (95.0%) (auto ~800)"
        }[display]
      );
      session.setAutoCompactionEnabled(false);
      session.sessionManager.appendCompaction("summary", null, 950);
      expect(stripTerminalSequences(read() ?? "")).toBe("?/1.0k");
      session.setAutoCompactionEnabled(true);
      expect(stripTerminalSequences(read() ?? "")).toBe(
        display === "verbose" ? "?/1.0k (auto ~800)" : "?/1.0k (auto)"
      );
      const noModel = vi.spyOn(session, "model", "get").mockReturnValue(undefined);
      expect(stripTerminalSequences(read() ?? "")).toBe("?/? (auto)");
      expect(
        stripTerminalSequences(
          builtinText(session, host.footerDataProvider, ui.theme).get("builtin:model") ?? ""
        )
      ).toBe("no-model");
      noModel.mockRestore();

      session.agent.state.model = { ...model, contextWindow: 200000 };
      const recovered = createFixtureMessage(model, 1000);
      recovered.usage = { ...zeroUsage(), input: 95000, totalTokens: 95000 };
      session.sessionManager.appendMessage(recovered);
      expect(stripTerminalSequences(read() ?? "")).toBe(
        {
          regular: "95k/200k (47.5%) (auto)",
          compact: "95k/200k (auto)",
          verbose: "95k/200k (47.5%) (auto ~200k)"
        }[display]
      );
    } finally {
      reserve.mockRestore();
      await fixture.dispose();
    }
  }
);

it("uses the active model's effective compaction reserve independently of the color threshold", async () => {
  const fixture = await hostFixture();
  const { session, host, ui } = fixture;
  const read = (verbose = true) =>
    stripTerminalSequences(
      builtinText(session, host.footerDataProvider, ui.theme, {
        contextThreshold: 90000,
        contextDisplay: verbose ? "verbose" : "compact"
      }).get("builtin:context") ?? ""
    );

  try {
    session.agent.state.model = { ...model, contextWindow: 200000 };
    session.settingsManager.applyOverrides({
      compaction: {
        enabled: true,
        reserveTokens: 16384,
        modelOverrides: { "fixture/reasoning": { reserveTokens: 50000 } }
      }
    });
    expect(read(false)).toBe("0/200k (auto)");
    expect(read()).toBe("0/200k (0.0%) (auto ~150k)");
    session.agent.state.model = { ...model, id: "other", contextWindow: 200000 };
    expect(read()).toBe("0/200k (0.0%) (auto ~184k)");
    session.settingsManager.applyOverrides({ compaction: { reserveTokens: 30000 } });
    expect(read()).toBe("0/200k (0.0%) (auto ~170k)");
    session.settingsManager.applyOverrides({ compaction: { reserveTokens: -1 } });
    expect(read()).toBe("0/200k (0.0%) (auto ~?)");
    session.setAutoCompactionEnabled(false);
    expect(read()).toBe("0/200k (0.0%)");
  } finally {
    await fixture.dispose();
  }
});

it("matches native compaction with the routed window and selected model reserve", async () => {
  const compactions: string[] = [];
  const fixture = await hostFixture([
    (pi) => {
      pi.on("session_before_compact", (event) => {
        compactions.push(event.reason);

        return { cancel: true };
      });
    }
  ]);
  const { session, host, ui } = fixture;

  try {
    const faux = fauxProvider({
      provider: "widget-fixture",
      models: [{ id: "physical", reasoning: true, contextWindow: 128000, maxTokens: 16384 }]
    });
    session.modelRuntime.registerNativeProvider(faux.provider);
    session.modelRuntime.registerVirtualModel({
      provider: "widget-fixture",
      id: "router",
      name: "Router",
      route: () => ({ model: faux.getModel(), thinkingLevel: "high" })
    });
    await session.modelRuntime.refresh({ allowNetwork: false });
    const router = new ModelRegistry(session.modelRuntime).find("widget-fixture", "router");
    if (!router) throw new Error("Missing fixture router");
    await session.setModel(router);
    session.settingsManager.applyOverrides({
      compaction: {
        enabled: true,
        reserveTokens: 16000,
        keepRecentTokens: 1,
        modelOverrides: { "widget-fixture/physical": { reserveTokens: 32000 } }
      },
      retry: { enabled: false }
    });

    for (const contextDisplay of ["regular", "compact", "verbose"] as const) {
      const beforeRouting = builtinText(session, host.footerDataProvider, ui.theme, {
        contextDisplay
      });
      expect(stripTerminalSequences(beforeRouting.get("builtin:context") ?? "")).toBe("?/? (auto)");
      expect(stripTerminalSequences(beforeRouting.get("builtin:model") ?? "")).toBe(
        "widget-fixture/router"
      );
    }

    await fixture.bind();
    faux.setResponses([
      fauxAssistantMessage("First response"),
      fauxAssistantMessage("Second response"),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Route the request");
    expect(session.routedModel?.model.id).toBe("physical");
    const values = builtinText(session, host.footerDataProvider, ui.theme, {
      contextDisplay: "verbose"
    });
    expect(stripTerminalSequences(values.get("builtin:context") ?? "")).toContain("/128k");
    expect(stripTerminalSequences(values.get("builtin:context") ?? "")).toContain("(auto ~112k)");
    expect(stripTerminalSequences(values.get("builtin:model") ?? "")).toBe(
      "widget-fixture/router → physical:high"
    );

    for (const [input, triggered] of [
      [100000, false],
      [120000, true]
    ] as const) {
      session.sessionManager.appendMessage({
        ...createFixtureMessage(faux.getModel(), Date.now()),
        usage: { ...zeroUsage(), input, totalTokens: input }
      });
      session.refreshContext();
      await session.prompt("Continue with recorded usage");
      expect(compactions.includes("threshold")).toBe(triggered);
    }

    session.settingsManager.applyOverrides({
      compaction: { modelOverrides: { "widget-fixture/router": { reserveTokens: 48000 } } }
    });
    const overridden = builtinText(session, host.footerDataProvider, ui.theme, {
      contextDisplay: "verbose"
    });
    expect(stripTerminalSequences(overridden.get("builtin:context") ?? "")).toContain(
      "(auto ~80k)"
    );
  } finally {
    await fixture.dispose();
  }
});

it("colours context usage by window percentage, or by thirds of a configured token threshold", async () => {
  const fixture = await hostFixture();
  const { session, host, ui } = fixture;
  const read = (threshold?: number) =>
    builtinText(session, host.footerDataProvider, ui.theme, { contextThreshold: threshold }).get(
      "builtin:context"
    );

  const setUsage = (input: number) => {
    const message = createFixtureMessage(model, input);
    message.usage = { ...zeroUsage(), input, totalTokens: input };
    session.sessionManager.appendMessage(message);
  };

  try {
    session.agent.state.model = model;
    session.setAutoCompactionEnabled(false);

    expect(read(300)).toBe(ui.theme.fg("dim", "0/1.0k (0.0%)"));

    for (const [input, color, text] of [
      [700, "dim", "700/1.0k (70.0%)"],
      [701, "warning", "701/1.0k (70.1%)"],
      [900, "warning", "900/1.0k (90.0%)"],
      [901, "error", "901/1.0k (90.1%)"]
    ] as const) {
      setUsage(input);
      expect(read()).toBe(ui.theme.fg(color, text));
    }

    // Threshold 300 splits at 100 / 200 / 300, each cut point starting the next band.
    for (const [input, color, text] of [
      [99, "dim", "99/1.0k (9.9%)"],
      [100, "success", "100/1.0k (10.0%)"],
      [199, "success", "199/1.0k (19.9%)"],
      [200, "warning", "200/1.0k (20.0%)"],
      [299, "warning", "299/1.0k (29.9%)"],
      [300, "error", "300/1.0k (30.0%)"],
      [950, "error", "950/1.0k (95.0%)"]
    ] as const) {
      setUsage(input);
      expect(read(300)).toBe(ui.theme.fg(color, text));
    }

    session.sessionManager.appendCompaction("summary", null, 950);
    expect(read(300)).toBe(ui.theme.fg("dim", "?/1.0k"));
  } finally {
    await fixture.dispose();
  }
});

it("reflects thinking/model changes, renames and branch data without adding activity", async () => {
  const fixture = await hostFixture();
  const { session, host, ui } = fixture;
  const read = (id: string) =>
    stripTerminalSequences(builtinText(session, host.footerDataProvider, ui.theme).get(id) ?? "");

  try {
    session.agent.state.model = model;
    session.setThinkingLevel("off");
    expect(read("builtin:model")).toBe("fixture/reasoning:off");
    session.setThinkingLevel("high");
    expect(read("builtin:model")).toBe("fixture/reasoning:high");
    session.agent.state.model = { ...model, reasoning: false };
    expect(read("builtin:model")).toBe("fixture/reasoning");
    session.sessionManager.appendSessionInfo("Renamed");
    expect(read("builtin:session-title")).toBe("Renamed");
    const branch = vi.spyOn(host.footerDataProvider, "getGitBranch").mockReturnValue("@abcdef");
    expect(read("builtin:git-branch")).toBe("@abcdef");
    branch.mockReturnValue(null);
    expect(read("builtin:git-branch")).toBe("");
    branch.mockRestore();
    const count = session.sessionManager.getEntries().length;
    read("builtin:tokens");
    expect(session.sessionManager.getEntries()).toHaveLength(count);
    expect(formatCwd("/home/person/repo", "/home/person")).toBe("~/repo");
    expect(formatCwd("/home/person-else/repo", "/home/person")).toBe("/home/person-else/repo");
  } finally {
    await fixture.dispose();
  }
});
