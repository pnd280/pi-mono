import { rm } from "node:fs/promises";

import { inspectGitIgnore } from "@pi-mono/libs/git-ignore";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { evaluateSearch } from "./evaluate-search.ts";
import { fixture } from "./test-fixture.ts";

vi.mock("@pi-mono/libs/git-ignore", () => ({ inspectGitIgnore: vi.fn() }));

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
  vi.mocked(inspectGitIgnore).mockReset();
});
afterEach(async () => {
  await rm(directory.root, { recursive: true, force: true });
});

it("blocks a target removed between scope extraction and Git inspection", async () => {
  vi.mocked(inspectGitIgnore).mockResolvedValue({ status: "missing" });

  await expect(
    evaluateSearch({
      kind: "grep",
      toolName: "ffgrep",
      input: { path: "src/main.ts" },
      cwd: directory.root
    })
  ).resolves.toStrictEqual({ kind: "block", reason: "No such file or directory" });
});

it("does not expose internal Git inspection failures", async () => {
  vi.mocked(inspectGitIgnore).mockResolvedValue({
    status: "unavailable",
    cause: new Error("sensitive repository detail")
  });

  await expect(
    evaluateSearch({
      kind: "grep",
      toolName: "ffgrep",
      input: { path: "src/main.ts" },
      cwd: directory.root
    })
  ).resolves.toStrictEqual({ kind: "allow", diagnostic: "Git inspection failed" });
});

it("settles at the inspection deadline even when an operation ignores cancellation", async () => {
  vi.useFakeTimers();
  const inspectionStarted = new Promise<void>((resolve) => {
    vi.mocked(inspectGitIgnore).mockImplementation(() => {
      resolve();

      return new Promise(() => {});
    });
  });

  try {
    const decision = evaluateSearch({
      kind: "grep",
      toolName: "ffgrep",
      input: { path: "src/main.ts" },
      cwd: directory.root
    });
    let settled: Awaited<typeof decision> | undefined;
    void decision.then((value) => {
      settled = value;
    });

    await inspectionStarted;
    expect(inspectGitIgnore).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(settled).toStrictEqual({ kind: "allow", diagnostic: "inspection timed out" });
  } finally {
    vi.useRealTimers();
  }
});
