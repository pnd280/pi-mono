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

it("uses native totals across assistant, tool, usage, compaction and branch entries but latest-prompt cache hit", async () => {
  const fixture = await hostFixture();
  const { session, host, ui } = fixture;
  const manager = session.sessionManager;

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
    const value =
      builtinText(session, host.footerDataProvider, ui.theme).get("builtin:tokens") ?? "";
    expect(stripTerminalSequences(value)).toBe("↑510 ↓51 R5.5k W250 CH99.0% $6.375");
    session.agent.state.model = { ...model, provider: "kimi-coding" };
    expect(
      stripTerminalSequences(
        builtinText(session, host.footerDataProvider, ui.theme).get("builtin:tokens") ?? ""
      )
    ).toMatch(/\$6\.375 \(sub\)$/);
    const subscription = vi
      .spyOn(session.modelRuntime, "isUsingSubscription")
      .mockReturnValue(true);
    session.agent.state.model = model;
    expect(
      stripTerminalSequences(
        builtinText(session, host.footerDataProvider, ui.theme).get("builtin:tokens") ?? ""
      )
    ).toMatch(/\(sub\)$/);
    subscription.mockRestore();
  } finally {
    await fixture.dispose();
  }
});

it("reports context usage, keeps post-compaction context unknown and uses runtime auto state", async () => {
  const fixture = await hostFixture();
  const { session, host, ui } = fixture;
  const read = () => builtinText(session, host.footerDataProvider, ui.theme).get("builtin:context");

  try {
    session.agent.state.model = model;
    session.setAutoCompactionEnabled(false);

    for (const input of [750, 950]) {
      const message = createFixtureMessage(model, input);
      message.usage = { ...zeroUsage(), input, totalTokens: input };
      session.sessionManager.appendMessage(message);
      expect(stripTerminalSequences(read() ?? "")).toBe(`${(input / 10).toFixed(1)}%/1.0k`);
    }

    session.sessionManager.appendCompaction("summary", null, 950);
    expect(stripTerminalSequences(read() ?? "")).toBe("?/1.0k");
    session.setAutoCompactionEnabled(true);
    expect(stripTerminalSequences(read() ?? "")).toBe("?/1.0k (auto)");
    const noModel = vi.spyOn(session, "model", "get").mockReturnValue(undefined);
    expect(stripTerminalSequences(read() ?? "")).toBe("?/? (auto)");
    expect(
      stripTerminalSequences(
        builtinText(session, host.footerDataProvider, ui.theme).get("builtin:model") ?? ""
      )
    ).toBe("no-model");
    noModel.mockRestore();
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
