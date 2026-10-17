import type { SessionStats } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vite-plus/test";

import { lateUsage } from "./background-result.ts";

function stats(total: number, cost: number): SessionStats {
  return {
    sessionFile: undefined,
    sessionId: "session",
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 0,
    tokens: { input: total, output: 0, cacheRead: 0, cacheWrite: 0, total },
    cost
  };
}

test("late usage counts only the unreported delta with its full model ID", () => {
  expect(lateUsage(undefined, stats(20, 0.002), "p/m")).toBeUndefined();
  expect(lateUsage(stats(10, 0.001), undefined, "p/m")).toBeUndefined();
  expect(lateUsage(stats(10, 0.001), stats(10, 0.001), "p/m")).toBeUndefined();
  expect(
    lateUsage(stats(10, 0.001), stats(25, 0.003), "openrouter/anthropic/claude")
  ).toMatchObject({
    provider: "openrouter",
    model: "anthropic/claude",
    usage: { input: 15, totalTokens: 15, cost: { total: 0.002 } }
  });
});
