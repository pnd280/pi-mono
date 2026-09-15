import {
  isKeyRelease,
  isKeyRepeat,
  matchesKey,
  type KeyId,
  type KeybindingsManager
} from "@earendil-works/pi-tui";

import { canonicalKey } from "../settings.ts";

export type BrowserAction =
  | "copy"
  | "cancel"
  | "confirm"
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "switch"
  | "preview"
  | "restore-remove"
  | "delete"
  | "search"
  | "ignore";

const configured = [
  ["copy", "tui.input.copy"],
  ["cancel", "tui.select.cancel"],
  ["confirm", "tui.select.confirm"],
  ["up", "tui.select.up"],
  ["down", "tui.select.down"],
  ["pageUp", "tui.select.pageUp"],
  ["pageDown", "tui.select.pageDown"]
] as const;

const fixed = [
  ["preview", "ctrl+p"],
  ["restore-remove", "alt+enter"],
  ["delete", "delete"],
  ["switch", "tab"],
  ["switch", "shift+tab"]
] as const;

export type BrowserKeys = Pick<KeybindingsManager, "matches" | "getKeys">;

export function actionFor(data: string, keys: BrowserKeys): BrowserAction {
  if (isKeyRelease(data)) return "ignore";

  for (const [action, id] of configured) {
    if (action === "cancel" && matchesKey(data, "ctrl+c")) continue;
    if (keys.matches(data, id)) return action;
  }

  for (const [action, key] of fixed) {
    if (matchesKey(data, key)) return action === "delete" && isKeyRepeat(data) ? "ignore" : action;
  }

  return matchesKey(data, "ctrl+c") ? "ignore" : "search";
}

export function usableCancelKeys(keys: BrowserKeys): KeyId[] {
  const copy = new Set(keys.getKeys("tui.input.copy").map(canonicalKey));

  return keys
    .getKeys("tui.select.cancel")
    .filter((key) => canonicalKey(key) !== "ctrl+c" && !copy.has(canonicalKey(key)));
}

export function fixedHints(keys: BrowserKeys, drafts: boolean): string[] {
  const occupied = new Set(
    configured.flatMap(([action, id]) =>
      keys
        .getKeys(id)
        .filter((key) => action !== "cancel" || canonicalKey(key) !== "ctrl+c")
        .map(canonicalKey)
    )
  );

  return fixed
    .filter(
      ([action, key]) => !occupied.has(canonicalKey(key)) && (action !== "restore-remove" || drafts)
    )
    .map(([action, key]) => `${key} ${action}`);
}
