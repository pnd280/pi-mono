import { expect, it } from "vite-plus/test";

import { canonicalKey, parseSettings } from "./settings.ts";

it("validates fields independently, floors/clamps finite numbers without coercion", () => {
  for (const [value, expected] of [
    [undefined, 250],
    ["8", 250],
    [Infinity, 250],
    [NaN, 250],
    [8.9, 8],
    [-10, 1],
    [9000, 5000]
  ]) {
    expect(parseSettings({ historyRetention: value }).settings.historyRetention).toBe(expected);
  }

  const result = parseSettings({
    historyRetention: 3,
    customMessageTypes: ["Exact", " space "],
    extra: true,
    shortcuts: { history: [], saveDraft: [null] }
  });
  expect(result.settings).toEqual({
    historyRetention: 3,
    customMessageTypes: ["Exact", " space "],
    shortcuts: { history: [], saveDraft: ["ctrl+shift+s"] }
  });
  expect(result.warnings).toHaveLength(2);
  expect(parseSettings({ customMessageTypes: ["good", ""] }).settings.customMessageTypes).toEqual(
    []
  );
});

it("canonicalizes aliases/modifier order and gives History collision ownership", () => {
  const { settings, warnings } = parseSettings({
    shortcuts: {
      history: ["SHIFT+ctrl+S", "ctrl+shift+s", "esc"],
      saveDraft: ["ctrl+shift+s", "escape", "ctrl+x"]
    }
  });
  expect(settings.shortcuts).toEqual({
    history: ["ctrl+shift+s", "escape"],
    saveDraft: ["ctrl+x"]
  });
  expect(warnings).toHaveLength(2);
  expect(canonicalKey("alt+return")).toBe("alt+enter");
  expect(canonicalKey("pageup")).toBe("pageUp");
  expect(canonicalKey("+")).toBe("+");
  expect(canonicalKey("ctrl++")).toBe("ctrl++");

  for (const value of [" ctrl+r", "control+r", "ctrl+ctrl+s", "ctrl+", "foo", "f13"])
    expect(canonicalKey(value)).toBeUndefined();
  expect(
    parseSettings({ shortcuts: { history: ["ctrl+x", "bogus"] } }).settings.shortcuts.history
  ).toEqual(["ctrl+r"]);
});
