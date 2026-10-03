import { initTheme } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { browserOptions, items, type TestItem } from "../components/browser/test-fixture.ts";
import { createInputHost, createTestTui, testKeys, testTheme } from "../test-fixture.ts";
import { openBrowser, type OpenBrowserOptions } from "./index.ts";

it.each([24, 18])(
  "pages the shared browser through fullscreen terminal input at %i rows",
  async (rows) => {
    initTheme("dark", false);
    const host = createInputHost();
    Object.defineProperty(host.terminal, "rows", { value: rows, configurable: true });
    const abort = new AbortController();
    const options = browserOptions(items(Array.from({ length: 40 }, (_, i) => `Item ${i}`)));
    const selected: string[] = [];

    options.sections[1]!.confirm!.run = (item) => {
      selected.push(item.id);

      return false;
    };

    const opening = openBrowser({
      ui: host.ui,
      signal: abort.signal,
      browser: options,
      onInputRoutingUnavailable: vi.fn(),
      onError: vi.fn()
    });

    try {
      await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Item 0"));
      host.send("\r");
      expect(selected).toEqual(["0"]);
      host.transcript.scrollTo(40);
      host.render();
      host.send("\x1b[6~");
      host.send("\r");
      expect(selected[1]).toBeDefined();
      expect(selected[1]).not.toBe("0");
      expect(host.transcript.scrollTop).toBe(40);
      host.send("\x1b[5~");
      host.send("\r");
      expect(selected[2]).toBe("0");
      abort.abort();
      await opening;
      host.send("\x1b[5~");
      expect(host.transcript.scrollTop).toBeLessThan(40);
    } finally {
      abort.abort();
      await opening;
      host.dispose();
    }
  }
);

it.each([false, true])(
  "routes preview paging across real fullscreen remounts (inspection=%s)",
  async (inspection) => {
    initTheme("dark", false);
    const host = createInputHost();
    const abort = new AbortController();
    const options = browserOptions(
      items([Array.from({ length: 100 }, (_, i) => `Detail ${i}`).join("\n")])
    );
    if (inspection)
      options.inspection = { index: 1, title: "Inspection", missingMessage: "Missing" };
    const unavailable = vi.fn();
    const afterClose = vi.fn();
    const opening = openBrowser({
      ui: host.ui,
      signal: abort.signal,
      browser: options,
      onError: vi.fn(),
      onInputRoutingUnavailable: unavailable,
      afterClose
    });

    try {
      await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Detail 0"));
      if (!inspection) host.send("\x10");

      const firstVisibleDetail = () =>
        host.presentation
          ?.render(80)
          .join("\n")
          .match(/Detail \d+/)?.[0];

      for (const rows of [24, 18, 19, 10, 24]) {
        const previous = host.presentation;
        const oldOverlay = host.tui.hasOverlay();
        Object.defineProperty(host.terminal, "rows", { value: rows, configurable: true });
        previous?.render(80);
        if (oldOverlay !== rows < 19)
          await vi.waitFor(() => expect(host.presentation).not.toBe(previous));
        await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Detail 0"));
        host.transcript.scrollTo(40);
        host.render();
        expect(firstVisibleDetail()).toBe("Detail 0");
        host.send("\x1b[6~");
        const pagedDetail = firstVisibleDetail();
        expect(pagedDetail).toMatch(/^Detail [1-9]\d*$/);
        expect(host.transcript.scrollTop).toBe(40);
        host.send("\x1b[6;1:3~");
        expect(firstVisibleDetail()).toBe(pagedDetail);
        host.send("\x1b[5~");
        expect(firstVisibleDetail()).toBe("Detail 0");
        expect(afterClose).not.toHaveBeenCalled();
      }

      host.send("\x1b");
      if (!inspection) host.send("\x1b");
      await opening;
      expect(afterClose).toHaveBeenCalledOnce();
      expect(unavailable).not.toHaveBeenCalled();
    } finally {
      abort.abort();
      await opening;
      host.dispose();
    }
  }
);

it("expires an inspection before its overlay mounts without popping an unrelated overlay", async () => {
  initTheme("dark", false);
  const tui = createTestTui();
  Object.defineProperty(tui.terminal, "rows", { value: 10 });
  const other = tui.showOverlay({ render: () => ["other overlay"], invalidate() {} });
  const entered = Promise.withResolvers<void>();
  const mount = Promise.withResolvers<void>();
  const abort = new AbortController();
  const options = browserOptions();
  options.inspection = { index: 1, title: "Inspection", missingMessage: "Missing item" };
  const ui: OpenBrowserOptions<TestItem>["ui"] = {
    custom: (factory, settings) =>
      new Promise((resolve, reject) => {
        void Promise.resolve(
          factory(tui, testTheme, testKeys, (result) => {
            if (settings?.overlay) tui.hideOverlay();
            resolve(result);
          })
        )
          .then(async (component) => {
            if (!settings?.overlay) return;
            entered.resolve();
            await mount.promise;
            settings.onHandle?.(tui.showOverlay(component));
          })
          .catch(reject);
      })
  };
  const afterClose = vi.fn();
  const opening = openBrowser({
    ui,
    signal: abort.signal,
    browser: options,
    afterClose,
    onInputRoutingUnavailable: vi.fn(),
    onError: vi.fn()
  });

  try {
    await entered.promise;
    abort.abort();
    expect(other.isFocused()).toBe(true);
    mount.resolve();
    await opening;
    expect(other.isFocused()).toBe(true);
    expect(afterClose).not.toHaveBeenCalled();
  } finally {
    mount.resolve();
    abort.abort();
    await opening;
    other.hide();
    tui.stop();
  }
});
