import {
  isKeyRelease,
  isKeyRepeat,
  matchesKey,
  type KeyId,
  type KeybindingsManager
} from "@earendil-works/pi-tui";

import {
  formatKeyLabel,
  resolveKeybindings,
  type KeybindingCandidate
} from "../../keybindings/index.ts";

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

/** Dispatch and hints resolve the same ordered bindings, including live keybinding changes. */
export class BrowserControls {
  constructor(private readonly keys: BrowserKeys) {}

  private bindings(): Binding[] {
    const candidates: KeybindingCandidate<BoundAction>[] = configured.map(([action, id]) => ({
      action,
      keys: this.keys.getKeys(id),
      ...(action === "cancel" ? { exclude: (key: KeyId) => key === "ctrl+c" } : {})
    }));
    candidates.push(...fixed.map(([action, key]) => ({ action, keys: [key] })));

    return resolveKeybindings(candidates);
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

    return binding ? formatKeyLabel(binding.key) : undefined;
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
