import * as fs from "node:fs/promises";
import path from "node:path";

import { inspectGitIgnore } from "@pi-mono/libs/git-ignore";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { evaluateSearch } from "./evaluate-search.ts";
import { fixture } from "./test-fixture.ts";

vi.mock("@pi-mono/libs/git-ignore", () => ({ inspectGitIgnore: vi.fn() }));
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

it("resolves ordinary explicit targets and glob roots without repeated filesystem probes", async () => {
  vi.mocked(inspectGitIgnore).mockResolvedValue({ status: "not-ignored" });

  for (const [searchPath, expected] of [
    ["src/main.ts", { kind: "allow" }],
    ["./src/missing.ts", { kind: "block", reason: "No such file or directory" }],
    ["src/main.ts/child", { kind: "block", reason: "No such file or directory" }],
    ["src/main.ts/**", { kind: "block", reason: "No such file or directory" }],
    ["src/**/*.missing", { kind: "allow" }]
  ]) {
    vi.mocked(fs.stat).mockClear();
    await expect(
      evaluateSearch({
        kind: "grep",
        toolName: "ffgrep",
        input: { path: searchPath },
        cwd: directory.root
      })
    ).resolves.toStrictEqual(expected);
    expect(fs.stat).toHaveBeenCalledTimes(1);
  }
});

it("inspects retained brace roots once each in first-seen order after exclusions", async () => {
  vi.mocked(inspectGitIgnore).mockResolvedValue({ status: "not-ignored" });

  await expect(
    evaluateSearch({
      kind: "multi",
      toolName: "fff-multi-grep",
      input: { constraints: "{src,.tmp}/*.{ts,js} !*.ts" },
      cwd: directory.root
    })
  ).resolves.toStrictEqual({ kind: "allow" });
  expect(vi.mocked(inspectGitIgnore).mock.calls.map(([input]) => input.path)).toStrictEqual([
    path.join(directory.root, "src"),
    path.join(directory.root, ".tmp")
  ]);
});

it.each(["target", "exclusion"])(
  "allows non-missing filesystem failures during %s resolution with a diagnostic",
  async (stage) => {
    const failure = Object.assign(new Error("fixture filesystem failure"), { code: "EACCES" });

    if (stage === "exclusion") {
      const info = await fs.stat(path.join(directory.root, "src"));
      vi.mocked(fs.stat).mockResolvedValueOnce(info);
    }

    vi.mocked(fs.stat).mockRejectedValueOnce(failure);

    await expect(
      evaluateSearch({
        kind: "grep",
        toolName: "ffgrep",
        input: { path: "src/", ...(stage === "exclusion" ? { exclude: "missing/" } : {}) },
        cwd: directory.root
      })
    ).resolves.toStrictEqual({ kind: "allow", diagnostic: "fixture filesystem failure" });
    expect(inspectGitIgnore).not.toHaveBeenCalled();
  }
);

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
