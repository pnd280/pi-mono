import { expect, it, vi } from "vite-plus/test";

import { LatestTask } from "./index.ts";

it("only commits the newest query and keeps its pending state while older work finishes", async () => {
  const changed = vi.fn();
  const task = new LatestTask({ changed });
  const first = Promise.withResolvers<string>();
  const second = Promise.withResolvers<string>();
  const commit = vi.fn();
  let firstCurrent = () => false;
  const a = task.run((current) => {
    firstCurrent = current;

    return first.promise;
  }, commit);
  expect(firstCurrent()).toBe(true);
  const b = task.run(() => second.promise, commit);
  expect(firstCurrent()).toBe(false);
  first.resolve("old");
  await a;
  expect(commit).not.toHaveBeenCalled();
  expect(task.pending).toBe(true);
  second.resolve("new");
  await b;
  expect(commit).toHaveBeenCalledExactlyOnceWith("new");
  expect(task.pending).toBe(false);
  task.dispose();
});

it("cancels queries, suppresses stale failures, and does no work after disposal", async () => {
  const task = new LatestTask({ changed() {} });
  const pending = Promise.withResolvers<string>();
  const commit = vi.fn();
  const work = task.run(() => pending.promise, commit);
  task.cancel();
  pending.reject(new Error("obsolete"));
  await work;
  expect(task.pending).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  await expect(
    task.run(async () => {
      throw new Error("current");
    }, commit)
  ).rejects.toThrow("current");
  expect(task.pending).toBe(false);
  task.dispose();
  const stopped = vi.fn(async () => "no");
  await task.run(stopped, commit);
  expect(stopped).not.toHaveBeenCalled();
});
