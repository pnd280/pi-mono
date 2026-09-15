import { expect, it } from "vite-plus/test";

import { canonicalKey } from "./index.ts";

it("normalizes key aliases and literal plus keys while rejecting invalid shortcut strings", () => {
  expect(canonicalKey("alt+return")).toBe("alt+enter");
  expect(canonicalKey("pageup")).toBe("pageUp");
  expect(canonicalKey("+")).toBe("+");
  expect(canonicalKey("ctrl++")).toBe("ctrl++");

  for (const value of [" ctrl+r", "control+r", "ctrl+ctrl+s", "ctrl+", "foo", "f13"])
    expect(canonicalKey(value)).toBeUndefined();
});
