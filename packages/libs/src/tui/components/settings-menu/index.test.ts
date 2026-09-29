import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

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

it("puts pagination directly below overflowing lists, never on the frame border", () => {
  for (const [width, height] of [
    [80, 22],
    [40, 8]
  ] as const)
    for (const selected of [0, 14, 29])
      for (const feedback of [undefined, settingsSaveFailure(new Error("Check access."))]) {
        const lines = renderSettingsMenu({ ...fixture(), width, height, selected, feedback });
        const lastItem = lines.map((line) => line.includes("Item ")).lastIndexOf(true);
        expect(lastItem).toBeGreaterThanOrEqual(0);
        expect(lines[lastItem + 1]).toBe(`  (${selected + 1}/30)`);
        expect(lines.some((line) => line.includes(`→ Item ${selected}`))).toBe(true);
        expect(lines.filter((line) => line.includes("/30"))).toHaveLength(1);
        expect(lines.join("\n")).not.toMatch(/[↑↓] \d+ more/u);
        if (width === 80) expect(lines.at(-1)).toMatch(/^─+$/u);
        expect(lines.length).toBeLessThanOrEqual(height);
      }
});

it.each([0, 1, 8])("omits pagination when all %i items fit", (count) => {
  const options = fixture();
  const lines = renderSettingsMenu({
    ...options,
    items: options.items.slice(0, count),
    selected: 0
  });
  expect(lines.filter((line) => line.includes("Item "))).toHaveLength(count);
  expect(lines.join("\n")).not.toMatch(/\d+\/\d+|[↑↓] \d+ more/u);
  expect(lines.at(-1)).toMatch(/^─+$/u);
  if (count === 0) expect(lines.join("\n")).toContain(options.emptyLabel);
});

it("budgets item gaps and pagination without hiding selection or controls", () => {
  const options = fixture();

  for (const height of [18, 22]) {
    const lines = renderSettingsMenu({
      ...options,
      height,
      items: options.items.map((item, index) => ({ ...item, gapBefore: index === 14 }))
    });
    const lastItem = lines.map((line) => line.includes("Item ")).lastIndexOf(true);
    expect(lines[lastItem + 1]).toBe("  (15/30)");
    const selected = lines.findIndex((line) => line.includes("→ Item 14"));
    expect(selected).toBeGreaterThan(0);
    expect(lines[selected - 1]).toBe("");
    expect(lines.join("\n")).toContain("Ctrl+S save");
    expect(lines.join("\n")).toContain("Esc close");
    expect(lines.length).toBeLessThanOrEqual(height);
  }
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

it("separates feedback from content when space allows", () => {
  const options = fixture();

  for (const feedback of [
    settingsSaveFeedback(false),
    settingsLoadFeedback(["Invalid settings"]),
    settingsSaveFailure(new Error("Check access."))
  ])
    for (const [width, height] of [
      [80, 22],
      [40, 14]
    ] as const) {
      const lines = renderSettingsMenu({ ...options, width, height, feedback });
      const message = lines.findIndex((line) => line.includes(feedback!.summary.split("\n")[0]!));
      expect(message).toBeGreaterThan(0);
      expect(lines[message - 1]).toBe("");
      expect(lines.join("\n")).toContain("→ Item 14");
      expect(lines.length).toBeLessThanOrEqual(height);
    }

  const tiny = renderSettingsMenu({
    ...options,
    height: 5,
    feedback: settingsSaveFeedback(false)
  });
  expect(tiny[1]).toBe("");
  expect(tiny[2]).toContain("Saved and applied.");
  expect(tiny).toHaveLength(5);
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

it("reports warning outcomes accurately", () => {
  const feedback = settingsSaveFeedback(true, ["Project settings cannot be read."]);
  expect(feedback.severity).toBe("warning");
  const output = renderSettingsMenu({ ...fixture(), height: 30, feedback }).join("\n");
  expect(output).toContain("Saved; project override active.");
  expect(output).toContain("Settings warning.");
  expect(output).toContain("Project settings cannot be read.");
});
