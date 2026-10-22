import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { assistantMessage } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { TranscriptRows } from "./rows.ts";

it("restores native assistant rows after release", () => {
  initTheme("dark", false);
  const coordinator = new TranscriptCoordinator("inactive-rows");
  const component = new AssistantMessageComponent(
    assistantMessage([{ type: "text", text: "Native assistant prose" }])
  );
  const rows = new TranscriptRows({ chatContainer: { children: [component] } });
  rows.attach(coordinator, { styleAssistant: true, chrome: true, failed: () => {} });

  try {
    rows.addMessage({ role: "assistant" }, () => {});
    rows.release();
    rows.addMessage({ role: "assistant" }, () => {});
    component.invalidate();
    const rendered = component.render(80).map(stripTerminalSequences).join("\n");
    expect(rendered).toContain("Native assistant prose");
    expect(rendered).not.toContain("•");
  } finally {
    rows.release();
    coordinator.dispose();
  }
});
