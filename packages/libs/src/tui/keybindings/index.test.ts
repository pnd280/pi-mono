import { expect, it } from "vite-plus/test";

import { canonicalKey, formatKeyLabel, resolveKeybindings } from "./index.ts";

it("formats key labels", () => {
  expect(formatKeyLabel("escape")).toBe("Esc");
  expect(formatKeyLabel("ctrl+pageDown")).toBe("Ctrl+PageDown");
  expect(formatKeyLabel("ctrl++")).toBe("Ctrl++");
});

it("resolves alternatives with ordered precedence", () => {
  expect(
    resolveKeybindings([
      {
        action: "cancel",
        keys: ["+", "ctrl+f1", "ctrl+c", "escape"],
        exclude: (key) => key === "ctrl+c"
      },
      { action: "confirm", keys: ["escape", "enter"] }
    ])
  ).toEqual([
    { action: "cancel", key: "escape" },
    { action: "confirm", key: "enter" }
  ]);
});

it("normalizes key aliases while rejecting invalid and undispatchable shortcuts", () => {
  expect(canonicalKey("alt+return")).toBe("alt+enter");
  expect(canonicalKey("pageup")).toBe("pageUp");
  expect(canonicalKey("ctrl+;")).toBe("ctrl+;");
  expect(canonicalKey("f12")).toBe("f12");

  for (const value of [
    " ctrl+r",
    "control+r",
    "ctrl+ctrl+s",
    "ctrl+",
    "foo",
    "f13",
    "+",
    "ctrl++",
    "shift+esc",
    "ctrl+alt+escape",
    "ctrl+f1",
    "super+F12"
  ])
    expect(canonicalKey(value), value).toBeUndefined();
});
