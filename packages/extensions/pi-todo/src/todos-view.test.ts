import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { TodosCustomViewHost } from "./commands.ts";
import { TodoController } from "./controller.ts";

beforeAll(() => initTheme("dark", false));

it("keeps close controls visible in a short regular-mode overlay", async () => {
  const fixture = await hostFixture();
  const controller = new TodoController();
  controller.apply("create", { subject: "Visible todo" });
  const view = new TodosCustomViewHost({ suppress: () => ({ release() {} }) });
  fixture.terminal.rows = 7;
  const write = vi.spyOn(fixture.host.ui.terminal, "write");
  fixture.host.ui.start();
  const opening = view.show({ ui: fixture.ui, signal: undefined }, controller);

  try {
    await vi.waitFor(() => expect(fixture.host.ui.hasOverlay()).toBe(true));
    write.mockClear();
    fixture.host.ui.renderNow(true);
    expect(stripTerminalSequences(write.mock.calls.flat().join(""))).toContain("Esc close");
  } finally {
    view.shutdown();
    await opening;
    await fixture.dispose();
  }
});
