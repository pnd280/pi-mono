import { expect, it, vi } from "vite-plus/test";

import { openResponsiveCustomUI, type ResponsiveCustomUIOptions } from "./index.ts";

it("never opens an already-cancelled presentation", async () => {
  const controller = new AbortController();
  controller.abort();
  const custom = vi.fn<() => Promise<never>>();
  const create = vi.fn<ResponsiveCustomUIOptions["create"]>();
  await openResponsiveCustomUI({
    ui: { custom },
    signal: controller.signal,
    create,
    useOverlay: () => false
  });
  expect(custom).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("propagates host failures and removes its abort listener", async () => {
  const controller = new AbortController();
  const added = vi.spyOn(controller.signal, "addEventListener");
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  const error = new Error("host unavailable");
  const custom = vi.fn<() => Promise<never>>().mockRejectedValue(error);
  await expect(
    openResponsiveCustomUI({
      ui: { custom },
      signal: controller.signal,
      create: () => ({ render: () => [], invalidate() {} }),
      useOverlay: () => false
    })
  ).rejects.toBe(error);
  expect(removed).toHaveBeenCalledWith("abort", added.mock.calls[0]?.[1]);
});
