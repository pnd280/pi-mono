import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import {
  renderSettingsMenu,
  settingsLoadFeedback,
  settingsSaveFeedback,
  settingsSaveFailure,
  type SettingsFeedback
} from "./index.ts";

function fixture() {
  return {
    width: 80,
    height: 22,
    theme: { fg: (_color: string, value: string) => value, bold: (value: string) => value },
    title: "Settings",
    scopes: [
      {
        id: "global",
        label: "global",
        destination: "/agent/settings.json",
        isSet: false,
        dirty: true
      },
      {
        id: "project",
        label: "project",
        destination: "/project/.pi/settings.json",
        isSet: false,
        dirty: false
      }
    ],
    scope: "global",
    items: Array.from({ length: 30 }, (_, index) => ({
      key: String(index),
      label: `Item ${index}`,
      description: "unavailable"
    })),
    selected: 14,
    emptyLabel: "No registered components.",
    hints: ["Ctrl+S save", "Esc close", "Tab scope", "↑/↓ select", "Shift+↑/↓ move"]
  };
}

it("keeps scope, target, position and fixed controls visible at 40x10", () => {
  const lines = renderSettingsMenu({ ...fixture(), width: 40, height: 8 });
  const output = lines.join("\n");
  expect(output).toContain("global* (not set)");
  expect(output).toContain("project (not set)");
  expect(output).toContain("→ Item 14");
  expect(output).toContain("15/30");
  expect(output).toContain("Ctrl+S save");
  expect(output).toContain("Esc close");
  expect(output).toContain("Shift+↑/↓ move");
  expect(lines.length).toBeLessThanOrEqual(8);
});

it("prioritizes save failure and recovery over metadata without hiding the selected target", () => {
  const feedback = settingsSaveFailure(
    new Error("Check access, JSON, size and locks.\nFile: /agent/settings.json")
  );
  const lines = renderSettingsMenu({ ...fixture(), width: 40, height: 8, feedback });
  const output = lines.join("\n");
  expect(output).toContain("→ Item 14");
  expect(output).toContain("Save failed. Draft retained.");
  expect(output).toContain("Check access, JSON, size and locks.");
  expect(output).toContain("Ctrl+S save");
  expect(output).toContain("Esc close");
  expect(lines.length).toBeLessThanOrEqual(8);
});

it("bounds every state and separates hints from content, even on tiny views", () => {
  const states: (SettingsFeedback | undefined)[] = [
    undefined,
    settingsSaveFeedback(true),
    settingsLoadFeedback(["Invalid settings in /agent/settings.json"]),
    settingsSaveFailure(new Error("Check settings and retry."))
  ];

  for (const feedback of states)
    for (const height of [1, 2, 3, 4, 5, 6, 7, 8, 10, 18, 22])
      for (const width of [1, 20, 40, 80]) {
        const lines = renderSettingsMenu({ ...fixture(), width, height, feedback });
        expect(lines.length).toBeLessThanOrEqual(height);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        if (width >= 20) expect(lines.join("\n")).toContain("Item 14");
        if (height >= 3 && width >= 40) expect(lines.join("\n")).toContain("Esc close");
        const controls = lines.findIndex((line) => line.includes("Ctrl+S save"));
        if (controls !== -1) expect(lines[controls - 1]).toBe("");
      }
});

it("never invents add or move actions for an empty settings collection", () => {
  const output = renderSettingsMenu({
    ...fixture(),
    items: [],
    hints: ["Ctrl+S save", "Esc close", "Tab scope"]
  }).join("\n");
  expect(output).toContain("No registered components.");
  expect(output).not.toContain("a add");
  expect(output).not.toContain("move");
});

it("sanitizes labels, scope paths and diagnostics without rewriting caller data", () => {
  const options = fixture();
  options.title = "Settings\x1b[2J";
  options.scopes[0]!.destination = "/agent/\x1b[2Jsettings.json";
  options.items[14]!.label = "界👩‍💻\tentry\x1b[2J\x07";
  const before = structuredClone({ ...options, theme: undefined });
  const output = renderSettingsMenu({
    ...options,
    feedback: settingsSaveFailure(new Error("Check settings\x1b[2J\x07"))
  }).join("\n");
  expect(output).not.toContain("\x1b");
  expect(output).not.toContain("\x07");
  expect(output).toContain("界👩‍💻 entry");
  expect(output).toContain("Settings: /agent/settings.json");
  expect({ ...options, theme: undefined }).toEqual(before);
});

it("does not evaluate passive previews unless there is room and reports warning outcomes accurately", () => {
  const preview = vi.fn(() => ["PASSIVE PREVIEW"]);
  renderSettingsMenu({ ...fixture(), width: 40, height: 8, preview });
  expect(preview).not.toHaveBeenCalled();
  const feedback = settingsSaveFeedback(true, ["Project settings cannot be read."]);
  expect(feedback.severity).toBe("warning");
  const output = renderSettingsMenu({ ...fixture(), height: 30, feedback, preview }).join("\n");
  expect(output).toContain("Saved; project override active.");
  expect(output).toContain("Settings warning.");
  expect(output).toContain("Project settings cannot be read.");
  expect(output).toContain("PASSIVE PREVIEW");
});
