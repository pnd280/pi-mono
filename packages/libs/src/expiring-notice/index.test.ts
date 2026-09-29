import { afterEach, expect, it, vi } from "vite-plus/test";

import { ExpiringNotice } from "./index.ts";

afterEach(() => vi.useRealTimers());

it("replaces and expires notices", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const changed = vi.fn();
  const notice = new ExpiringNotice({ durationMs: 100, changed });
  notice.set("first");
  expect(notice.value).toBe("first");
  await vi.advanceTimersByTimeAsync(80);
  notice.set("second");
  await vi.advanceTimersByTimeAsync(30);
  expect(notice.value).toBe("second");
  await vi.advanceTimersByTimeAsync(70);
  expect(notice.value).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(3);
  notice.dispose();
});

it("suppresses late updates and expiry callbacks after disposal", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const changed = vi.fn();
  const notice = new ExpiringNotice({ durationMs: 100, changed });
  notice.set("current");
  notice.dispose();
  notice.set("late");
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(notice.value).toBeUndefined();
});
