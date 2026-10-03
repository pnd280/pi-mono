import { expect, it, vi } from "vite-plus/test";

import { OrderSettingsView } from "../components/order-settings/index.ts";
import { createInputHost } from "../test-fixture.ts";
import { openResponsiveCustomUI } from "./index.ts";

it.each(["factory", "before-install", "open", "remount"] as const)(
  "deactivates synchronously on cancellation during %s",
  async (phase) => {
    const host = createInputHost();
    const abort = new AbortController();
    const dispose = vi.fn();
    const handleInput = vi.fn();
    const unavailable = vi.fn();
    const focus = host.tui.setFocus.bind(host.tui);
    vi.spyOn(host.tui, "setFocus").mockImplementation((component) => {
      focus(component);
      if (phase === "before-install" && component !== host.editor) abort.abort();
    });
    const opening = openResponsiveCustomUI({
      ui: host.ui,
      signal: abort.signal,
      useOverlay: (tui) => tui.terminal.rows < 19,
      onTransition: () => {
        if (phase === "remount") abort.abort();
      },
      onInputRoutingUnavailable: unavailable,
      create: () => {
        if (phase === "factory") abort.abort();

        return {
          render: () => ["view"],
          invalidate() {},
          handleInput,
          dispose,
          ownsFullscreenInput: () => true
        };
      }
    });

    try {
      if (phase === "open" || phase === "remount") {
        await vi.waitFor(() => expect(host.presentation).toBeDefined());
        if (phase === "remount") {
          Object.defineProperty(host.terminal, "rows", { value: 18 });
          host.presentation?.render(80);
        } else abort.abort();
        host.presentation?.handleInput?.("\x1b[6~");
        expect(handleInput).not.toHaveBeenCalled();
      }

      await opening;
      expect(dispose).toHaveBeenCalledOnce();
      expect(unavailable).not.toHaveBeenCalled();
      host.transcript.scrollTo(40);
      host.send("\x1b[5~");
      expect(host.transcript.scrollTop).toBeLessThan(40);
    } finally {
      abort.abort();
      await opening;
      host.dispose();
    }
  }
);

it("keeps the working-message ordering menu opted out through shared mounting", async () => {
  const host = createInputHost();
  const abort = new AbortController();
  const opening = openResponsiveCustomUI({
    ui: host.ui,
    signal: abort.signal,
    useOverlay: () => false,
    create: (tui, theme, _keys, close) =>
      new OrderSettingsView({
        title: "Working message",
        items: [{ id: "activity", label: "Activity", description: "" }],
        scopes: [
          { id: "session", label: "Session", destination: "", isSet: true, order: ["activity"] }
        ],
        initialScope: "session",
        theme,
        rows: () => tui.terminal.rows,
        requestRender: () => tui.requestRender(),
        save: () => ({ severity: "success", summary: "Saved and applied." }),
        close
      })
  });

  try {
    await vi.waitFor(() => expect(host.presentation).toBeDefined());
    const before = host.presentation?.render(80);
    host.transcript.scrollTo(40);
    host.send("\x1b[5~");
    expect(host.transcript.scrollTop).toBeLessThan(40);
    expect(host.presentation?.render(80)).toEqual(before);
    host.send("\x1b");
    await opening;
  } finally {
    abort.abort();
    await opening;
    host.dispose();
  }
});
