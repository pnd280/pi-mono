import { expect, it, vi } from "vite-plus/test";

import { createInputHost, testKeys } from "../test-fixture.ts";
import { openResponsiveCustomUI } from "./index.ts";

it.each(["regular", "fullscreen"] as const)(
  "pages a focused inline view through %s terminal input",
  async (mode) => {
    const host = createInputHost(mode);
    const abort = new AbortController();
    let selected = 0;
    const opening = openResponsiveCustomUI({
      ui: host.ui,
      signal: abort.signal,
      useOverlay: () => false,
      onInputRoutingUnavailable: vi.fn(),
      create: () => ({
        render: () => [`Selected ${selected}/100`],
        invalidate() {},
        ownsFullscreenInput: (data: string) =>
          testKeys.matches(data, "tui.select.pageUp") ||
          testKeys.matches(data, "tui.select.pageDown"),
        handleInput: (data: string) => {
          if (testKeys.matches(data, "tui.select.pageDown")) selected += 10;
          if (testKeys.matches(data, "tui.select.pageUp")) selected -= 10;
        }
      })
    });

    try {
      await vi.waitFor(() => expect(host.presentation).toBeDefined());
      host.transcript.scrollTo(40);
      host.render();
      host.send("\x1b[6~");
      expect(selected).toBe(10);
      host.send("\x1b[5~");
      expect(selected).toBe(0);
      if (mode === "fullscreen") expect(host.transcript.scrollTop).toBe(40);
      abort.abort();
      await opening;

      if (mode === "fullscreen") {
        host.send("\x1b[5~");
        expect(host.transcript.scrollTop).toBeLessThan(40);
      }
    } finally {
      abort.abort();
      await opening;
      host.dispose();
    }
  }
);

it("never opens an already-cancelled presentation", async () => {
  const controller = new AbortController();
  controller.abort();
  const custom = vi.fn<() => Promise<never>>();
  const create = vi.fn(() => ({ render: () => [], invalidate() {} }));
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
