import { expect, it, vi } from "vite-plus/test";

import { deferred } from "../test-fixture.ts";
import { WriteLifetime } from "./lifetime.ts";

it("aborts unstarted work but waits for every started write, including failures", async () => {
  const lifetime = new WriteLifetime();
  const first = deferred<string>();
  const second = deferred<void>();
  const result = lifetime.atomic(() => first.promise);
  const failed = lifetime.atomic(() => second.promise).catch((error: unknown) => error);
  const finished = vi.fn();
  const disposal = lifetime.dispose().then(finished);
  expect(lifetime.signal.aborted).toBe(true);
  const late = vi.fn(async () => "late");
  expect(() => lifetime.atomic(late)).toThrow();
  expect(late).not.toHaveBeenCalled();
  first.resolve("committed");
  expect(await result).toBe("committed");
  expect(finished).not.toHaveBeenCalled();
  second.reject(new Error("failed"));
  await failed;
  await disposal;
  expect(finished).toHaveBeenCalledTimes(1);
  await lifetime.dispose();
});
