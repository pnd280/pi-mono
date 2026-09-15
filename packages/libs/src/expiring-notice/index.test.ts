import { afterEach, expect, it, vi } from "vite-plus/test";

import { ExpiringNotice } from "./index.ts";

afterEach(() => vi.useRealTimers());

it("replaces and expires notices, reporting overflow only once outside the render stack", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const changed = vi.fn();
  const report = vi.fn();
  const notice = new ExpiringNotice({ durationMs: 100, changed, report });
  notice.set("first");
  notice.reportOnce();
  notice.reportOnce();
  expect(report).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(report).toHaveBeenCalledExactlyOnceWith("first");
  await vi.advanceTimersByTimeAsync(80);
  notice.set("second");
  await vi.advanceTimersByTimeAsync(30);
  expect(notice.value).toBe("second");
  await vi.advanceTimersByTimeAsync(70);
  expect(notice.value).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(3);
  notice.dispose();
});

it("suppresses replaced or disposed deferred reports and late expiry callbacks", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const changed = vi.fn();
  const report = vi.fn();
  const notice = new ExpiringNotice({ durationMs: 100, changed, report });
  notice.set("old");
  notice.reportOnce();
  notice.set("new");
  await Promise.resolve();
  expect(report).not.toHaveBeenCalled();
  notice.reportOnce();
  notice.dispose();
  notice.set("late");
  await vi.advanceTimersByTimeAsync(100);
  expect(report).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(notice.value).toBeUndefined();
});
