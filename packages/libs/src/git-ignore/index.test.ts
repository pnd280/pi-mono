import { resolve } from "node:path";

import { expect, it } from "vite-plus/test";

import { inspectGitIgnore, type GitCommand } from "./index.ts";

it("separates caller cancellation from a caller-supplied deadline", async () => {
  const waiting: GitCommand = (_cwd, _args, _input, signal) =>
    new Promise((_resolve, reject) => {
      signal.throwIfAborted();
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  const options = { path: resolve("."), cwd: resolve("."), timeoutMs: 10, git: waiting };
  const controller = new AbortController();
  const pending = inspectGitIgnore({ ...options, signal: controller.signal });
  controller.abort();
  expect(await pending).toEqual({ status: "cancelled" });
  expect(await inspectGitIgnore({ ...options, signal: controller.signal })).toEqual({
    status: "cancelled"
  });
  expect(await inspectGitIgnore(options)).toEqual({ status: "timed-out" });
});

it("retains inspection failures for consumer diagnostics and rejects invalid prerequisites", async () => {
  const cause = new Error("Git failed\nwith details");

  const git: GitCommand = async () => {
    throw cause;
  };

  const options = { path: resolve("."), cwd: resolve("."), timeoutMs: 2000, git };
  expect(await inspectGitIgnore(options)).toEqual({ status: "unavailable", cause });
  await expect(inspectGitIgnore({ ...options, path: "relative" })).rejects.toThrow("absolute");
  await expect(inspectGitIgnore({ ...options, timeoutMs: Infinity })).rejects.toThrow(RangeError);
});
