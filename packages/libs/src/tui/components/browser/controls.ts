import {
  isKeyRelease,
  isKeyRepeat,
  matchesKey,
  type KeyId,
  type KeybindingsManager
} from "@earendil-works/pi-tui";

import { canonicalKey } from "../../keybindings/index.ts";

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
  ["switch", "shift+tab"]
] as const;

export type BrowserKeys = Pick<KeybindingsManager, "getKeys">;

type Binding = { action: BoundAction; key: KeyId };

function keyLabel(key: string): string {
  return key
    .split("+")
    .map((part) => {
      if (part === "escape") return "Esc";
      if (part === "delete") return "Del";

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

/** Dispatch and hints resolve the same ordered bindings, including live keybinding changes. */
export class BrowserControls {
  constructor(private readonly keys: BrowserKeys) {}

  private bindings(): Binding[] {
    const occupied = new Set<KeyId>();
    const bindings: Binding[] = [];

    const claim = (action: BoundAction, candidate: KeyId) => {
      const key = canonicalKey(candidate);
      if (!key || occupied.has(key) || (action === "cancel" && key === "ctrl+c")) return;
      occupied.add(key);
      bindings.push({ action, key });
    };

    for (const [action, id] of configured)
      for (const key of this.keys.getKeys(id)) claim(action, key);
    for (const [action, key] of fixed) claim(action, key);

    return bindings;
  }

  actionFor(data: string): BrowserAction {
    if (isKeyRelease(data)) return "ignore";
    const binding = this.bindings().find(({ key }) => matchesKey(data, key));
    if (binding)
      return binding.action === "delete" && isKeyRepeat(data) ? "ignore" : binding.action;

    return matchesKey(data, "ctrl+c") ? "ignore" : "search";
  }

  key(action: BoundAction): string | undefined {
    const binding = this.bindings().find((candidate) => candidate.action === action);

    return binding ? keyLabel(binding.key) : undefined;
  }

  hint(action: BoundAction, label: string): string | undefined {
    const key = this.key(action);
    if (key) return `${key}${action === "delete" ? "×2" : ""} ${label}`;

    return configured.some(([candidate]) => candidate === action)
      ? `${label} unavailable`
      : undefined;
  }

  navigationHints(label: string): string[] {
    const up = this.key("up");
    const down = this.key("down");
    if (up && down) return [`${up === "Up" && down === "Down" ? "↑↓" : `${up}/${down}`} ${label}`];

    return [this.hint("up", `${label} up`)!, this.hint("down", `${label} down`)!];
  }
}
