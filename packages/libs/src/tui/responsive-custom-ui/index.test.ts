import { expect, it, vi } from "vite-plus/test";

import { createInputHost, testKeys } from "../test-fixture.ts";
import { openResponsiveCustomUI } from "./index.ts";

it("pages a focused inline view through regular terminal input", async () => {
  const host = createInputHost("regular");
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
    abort.abort();
    await opening;
  } finally {
    abort.abort();
    await opening;
    host.dispose();
  }
});
