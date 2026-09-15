import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Browser, browserLayout, type BrowserOptions } from "../components/browser/index.ts";
import { openResponsiveCustomUI } from "../responsive-custom-ui/index.ts";

export type OpenBrowserOptions<Item> = {
  ui: Pick<ExtensionContext["ui"], "custom">;
  signal: AbortSignal;
  browser: BrowserOptions<Item>;
  onError(this: void, error: unknown): void;
  /** Runs after final host closure, when Pi has restored its inline editor snapshot. */
  afterClose?(): void | Promise<void>;
};

export async function openBrowser<Item>(options: OpenBrowserOptions<Item>): Promise<void> {
  const active = () => !options.signal.aborted;
  if (!active()) return;
  let view: Browser<Item> | undefined;
  let requestRender: (() => void) | undefined;
  const abort = () => view?.controller.close();
  options.signal.addEventListener("abort", abort, { once: true });

  try {
    await openResponsiveCustomUI({
      ui: options.ui,
      signal: options.signal,
      useOverlay: (tui) => browserLayout(tui.terminal.rows).overlay,
      overlayOptions: { width: "100%", maxHeight: "75%", anchor: "center" },
      onTransition: () => view?.controller.cancelConfirmation(),
      create: (tui, theme, keys, close) => {
        requestRender = () => tui.requestRender();
        view = new Browser(options.browser, { tui, theme, keys, close, onError: options.onError });
        if (active()) void view.controller.activate();

        return view;
      }
    });
  } finally {
    options.signal.removeEventListener("abort", abort);
    view?.dispose();
  }

  if (active()) {
    try {
      const operation = options.afterClose?.();
      // Reflect synchronous editor updates before waiting for subsequent I/O.
      requestRender?.();
      await operation;
    } finally {
      // Editor updates themselves do not request a redraw.
      if (active()) requestRender?.();
    }
  }
}
