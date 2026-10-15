import * as fs from "node:fs/promises";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { evaluateSearch } from "./evaluate-search.ts";
import { inspectGitIgnore } from "./git-ignore.ts";
import { fixture } from "./test-fixture.ts";

vi.mock("./git-ignore.ts", () => ({ inspectGitIgnore: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();

  return { ...actual, stat: vi.fn(actual.stat) };
});

let directory: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  directory = await fixture();
  vi.mocked(inspectGitIgnore).mockReset();
  vi.mocked(fs.stat).mockReset();
});
afterEach(async () => {
  await fs.rm(directory.root, { recursive: true, force: true });
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

  const decision = await evaluateSearch({
    kind: "grep",
    toolName: "ffgrep",
    input: { path: "src/main.ts" },
    cwd: directory.root
  });
  expect(decision.kind).toBe("allow");
  if (decision.kind !== "allow") throw new Error("Expected an allowed search.");
  expect(decision.diagnostic).toBeTruthy();
  expect(decision.diagnostic).not.toContain("sensitive repository detail");
});

it("blocks an ignored target after another target's inspection fails", async () => {
  vi.mocked(inspectGitIgnore)
    .mockResolvedValueOnce({ status: "unavailable", cause: new Error("failed") })
    .mockResolvedValueOnce({ status: "ignored" });

  const decision = await evaluateSearch({
    kind: "grep",
    toolName: "ffgrep",
    input: { path: "{src,node_modules}" },
    cwd: directory.root
  });
  expect(decision.kind).toBe("block");
});

it.each(["scope extraction", "Git inspection"])(
  "settles at the deadline even when %s ignores cancellation",
  async (stage) => {
    vi.useFakeTimers();
    const inspectionStarted = new Promise<void>((resolve) => {
      const pending = () => {
        resolve();

        return new Promise<never>(() => {});
      };

      if (stage === "scope extraction") vi.mocked(fs.stat).mockImplementationOnce(pending);
      else vi.mocked(inspectGitIgnore).mockImplementation(pending);
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
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
      expect(settled?.kind).toBe("allow");
      if (settled?.kind !== "allow") throw new Error("Expected an allowed search.");
      expect(settled.diagnostic).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  }
);
