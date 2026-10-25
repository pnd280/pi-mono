import { isKeyRelease, isKeyRepeat, matchesKey, type KeyId } from "@earendil-works/pi-tui";

import { KeyControls, type KeybindingSource, type KeyControl } from "../../keybindings/index.ts";

export type BrowserAction =
  | "copy"
  | "cancel"
  | "confirm"
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "switch"
  | "switchBack"
  | "preview"
  | "alternate"
  | "delete"
  | "search"
  | "ignore";

type BoundAction = Exclude<BrowserAction, "search" | "ignore">;

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
  ["alternate", "alt+enter"],
  ["delete", "delete"],
  ["switch", "tab"],
  ["switchBack", "shift+tab"]
] as const;

export type BrowserKeys = KeybindingSource;

/** Dispatch and hints resolve the same ordered bindings, including live keybinding changes. */
export class BrowserControls {
  private readonly controls: KeyControls<BoundAction>;

  constructor(keys: BrowserKeys) {
    this.controls = new KeyControls<BoundAction>(keys, [
      ...configured.map(([action, id]): KeyControl<BoundAction> => ({
        action,
        id,
        ...(action === "cancel" ? { exclude: (key: KeyId) => key === "ctrl+c" } : {})
      })),
      ...fixed.map(([action, key]) => ({ action, key }))
    ]);
  }

  actionFor(data: string): BrowserAction {
    if (isKeyRelease(data)) return "ignore";
    const action = this.controls.actionFor(data);
    if (action) return action === "delete" && isKeyRepeat(data) ? "ignore" : action;

    return matchesKey(data, "ctrl+c") ? "ignore" : "search";
  }

  key(action: BoundAction): string | undefined {
    return this.controls.label(action);
  }

  hint(action: (typeof configured)[number][0], label: string): string;
  hint(action: BoundAction, label: string): string | undefined;
  hint(action: BoundAction, label: string): string | undefined {
    const key = this.key(action);
    if (key) return `${key}${action === "delete" ? "×2" : ""} ${label}`;

    return configured.some(([candidate]) => candidate === action)
      ? `${label} unavailable`
      : undefined;
  }

  navigationHints(label: string): string[] {
    return this.controls.navigationHints("up", "down", label);
  }
}
