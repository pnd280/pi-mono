import { expect, it } from "vite-plus/test";

import { canonicalKey, formatKeyLabel, resolveKeybindings } from "./index.ts";

it("formats canonical key labels", () => {
  expect(formatKeyLabel("escape")).toBe("Esc");
  expect(formatKeyLabel("ctrl+pageDown")).toBe("Ctrl+PageDown");
  expect(formatKeyLabel("ctrl++")).toBe("Ctrl++");
});

it("resolves alternatives with ordered precedence", () => {
  expect(
    resolveKeybindings([
      { action: "cancel", keys: ["ctrl+c", "escape"], exclude: (key) => key === "ctrl+c" },
      { action: "confirm", keys: ["escape", "enter"] }
    ])
  ).toEqual([
    { action: "cancel", key: "escape" },
    { action: "confirm", key: "enter" }
  ]);
});

it("normalizes key aliases and literal plus keys while rejecting invalid shortcut strings", () => {
  expect(canonicalKey("alt+return")).toBe("alt+enter");
  expect(canonicalKey("pageup")).toBe("pageUp");
  expect(canonicalKey("+")).toBe("+");
  expect(canonicalKey("ctrl++")).toBe("ctrl++");

  for (const value of [" ctrl+r", "control+r", "ctrl+ctrl+s", "ctrl+", "foo", "f13"])
    expect(canonicalKey(value)).toBeUndefined();
});
