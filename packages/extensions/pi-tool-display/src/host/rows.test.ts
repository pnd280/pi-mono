import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { assistantMessage } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { TranscriptRows } from "./rows.ts";

it("ignores late assistant components after binding deactivation", () => {
  initTheme("dark", false);
  const coordinator = new TranscriptCoordinator("inactive-rows");
  let active = true;
  const rows = new TranscriptRows({}, coordinator, {
    active: () => active,
    styleAssistant: true,
    chrome: true
  });
  const component = new AssistantMessageComponent(
    assistantMessage([{ type: "text", text: "Native assistant prose" }])
  );

  try {
    active = false;
    rows.dispose();
    rows.assistantBoundary(component);
    component.invalidate();
    const rendered = component.render(80).map(stripTerminalSequences).join("\n");
    expect(rendered).toContain("Native assistant prose");
    expect(rendered).not.toContain("•");
  } finally {
    rows.dispose();
    coordinator.dispose();
  }
});
