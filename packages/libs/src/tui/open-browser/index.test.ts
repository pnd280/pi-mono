import { getKeybindings } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { inputHostFixture } from "../../validation/interactive-host/index.ts";
import { STEP_TIMEOUT_MS } from "../../validation/pi-process/index.ts";
import { browserOptions, items, type TestItem } from "../components/browser/test-fixture.ts";
import { openBrowser, type OpenBrowserOptions } from "./index.ts";

it.each([24, 18])(
  "pages the shared browser through fullscreen terminal input at %i rows",
  async (rows) => {
    const host = await inputHostFixture();
    Object.defineProperty(host.terminal, "rows", { value: rows, configurable: true });
    host.ui.setEditorText("saved draft");
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
      await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Item 0"), {
        interval: 1,
        timeout: STEP_TIMEOUT_MS
      });
      host.send("\r");
      expect(selected).toEqual(["0"]);
      host.render();
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
      host.send("!");
      expect(host.ui.getEditorText()).toBe("saved draft!");
      host.send("\x1b[5~");
      expect(host.transcript.scrollTop).toBeLessThan(40);
    } finally {
      abort.abort();
      await opening;
    }
  }
);

it.each([false, true])(
  "routes preview paging across real fullscreen remounts (inspection=%s)",
  async (inspection) => {
    const host = await inputHostFixture();
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
      await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Detail 0"), {
        interval: 1,
        timeout: STEP_TIMEOUT_MS
      });
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
          await vi.waitFor(() => expect(host.presentation).not.toBe(previous), {
            interval: 1,
            timeout: STEP_TIMEOUT_MS
          });
        await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("Detail 0"), {
          interval: 1,
          timeout: STEP_TIMEOUT_MS
        });
        host.transcript.scrollTo(40);
        host.render();
        if (previous !== host.presentation) previous?.handleInput?.("\x1b[6~");
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
    }
  }
);

it("closes once when cancel is remapped to transcript paging and restores the editor before effects", async () => {
  const host = await inputHostFixture();
  getKeybindings().setUserBindings({ "tui.select.cancel": ["pageDown"] });
  host.ui.setEditorText("saved draft");
  const abort = new AbortController();
  const afterClose = vi.fn(() => {
    expect(host.ui.getEditorText()).toBe("saved draft");
    host.ui.setEditorText("after closure");
  });
  const opening = openBrowser({
    ui: host.ui,
    signal: abort.signal,
    browser: browserOptions(),
    afterClose,
    onError: vi.fn(),
    onInputRoutingUnavailable: vi.fn()
  });

  try {
    await vi.waitFor(() => expect(host.presentation?.render(80).join()).toContain("alpha"), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    host.render();
    host.transcript.scrollTo(40);
    host.render();
    const stale = host.presentation!;
    host.send("\x1b[6~");
    await vi.waitFor(() => expect(afterClose).toHaveBeenCalledOnce(), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    await opening;
    expect(host.transcript.scrollTop).toBe(40);
    stale.handleInput?.("\x1b[6~");
    expect(afterClose).toHaveBeenCalledOnce();
    host.send("!");
    expect(host.ui.getEditorText()).toBe("after closure!");
    host.render();
    host.send("\x1b[6~");
    expect(host.transcript.scrollTop).toBeGreaterThan(40);
  } finally {
    abort.abort();
    await opening;
  }
});

it("expires an inspection before its overlay mounts without popping an unrelated overlay", async () => {
  const host = await inputHostFixture("regular");
  const tui = host.tui;
  Object.defineProperty(tui.terminal, "rows", { value: 10 });
  const other = tui.showOverlay({ render: () => ["other overlay"], invalidate() {} });
  const entered = vi.fn();
  const mount = Promise.withResolvers<void>();
  const abort = new AbortController();
  const options = browserOptions();
  options.inspection = { index: 1, title: "Inspection", missingMessage: "Missing item" };
  const ui: OpenBrowserOptions<TestItem>["ui"] = {
    custom: (factory, settings) =>
      host.ui.custom(async (...args) => {
        const component = await factory(...args);

        if (settings?.overlay) {
          entered();
          await mount.promise;
        }

        return component;
      }, settings)
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
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce(), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    abort.abort();
    // The real host restores its editor snapshot before the delayed overlay returns.
    // A surviving handle must still be able to focus its own overlay.
    other.focus();
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
  }
});
