import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

it("exposes live native registries, same-key disposal, footer ownership, and runtime compaction", async () => {
  const fixture = await hostFixture();
  const { host, ui, session } = fixture;
  const dispose = vi.fn();
  const component = { render: () => ["native"], invalidate() {}, dispose };

  try {
    ui.setWidget("same", () => component);
    expect(host.extensionWidgetsAbove.get("same")).toBe(component);
    expect(host.widgetContainerAbove.children).toContain(component);
    ui.setStatus("same", "status");
    expect(host.footerDataProvider.getExtensionStatuses().get("same")).toBe("status");
    ui.setWidget("same", ["replacement"], { placement: "belowEditor" });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.extensionWidgetsAbove.size).toBe(0);
    expect(host.extensionWidgetsBelow.size).toBe(1);
    ui.setWidget("same", undefined);
    expect(host.extensionWidgetsBelow.size).toBe(0);
    ui.setFooter(() => component);
    expect(host.customFooter).toBe(component);
    ui.setFooter(undefined);
    expect(dispose).toHaveBeenCalledTimes(2);
    session.setAutoCompactionEnabled(false);
    expect(session.autoCompactionEnabled).toBe(false);
    session.setAutoCompactionEnabled(true);
    expect(session.autoCompactionEnabled).toBe(true);
  } finally {
    await fixture.dispose();
  }
});
