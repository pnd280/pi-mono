import {
  isKeyRelease,
  matchesKey,
  type KeybindingsManager,
  type KeyId
} from "@earendil-works/pi-tui";
import { formatKeyLabel, navigationHints, resolveKeybindings } from "@pi-mono/libs/tui/keybindings";

export type PanelKeys = Pick<KeybindingsManager, "getKeys">;

type PanelKind = "panel" | "task" | "job";

export type PanelAction =
  | "cancel"
  | "confirm"
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "expand"
  | "first"
  | "last"
  | "nextView"
  | "previousView"
  | "abort"
  | "background";

const configured = [
  ["cancel", "tui.select.cancel"],
  ["confirm", "tui.select.confirm"],
  ["up", "tui.select.up"],
  ["down", "tui.select.down"],
  ["pageUp", "tui.select.pageUp"],
  ["pageDown", "tui.select.pageDown"],
  ["expand", "app.tools.expand"]
] as const;

/** Navigation, hints, and fullscreen ownership use the same live bindings and precedence. */
export class PanelControls {
  constructor(
    private keys: PanelKeys,
    private kind: PanelKind
  ) {}

  private bindings() {
    const candidates = configured
      .filter(([action]) =>
        action === "confirm" ? this.kind === "panel" : action !== "expand" || this.kind === "task"
      )
      .map(([action, id]) => ({
        action,
        keys: this.keys.getKeys(id),
        // Leave copying and interruption to the host, as the shared browser does.
        ...(action === "cancel" ? { exclude: (key: KeyId) => key === "ctrl+c" } : {})
      }));
    const fixed: [PanelAction, KeyId][] =
      this.kind === "panel"
        ? [
            ["nextView", "tab"],
            ["previousView", "shift+tab"],
            ["abort", "ctrl+d"],
            ["background", "ctrl+b"]
          ]
        : [
            ["abort", "ctrl+d"],
            ["first", "home"],
            ["last", "end"]
          ];

    return resolveKeybindings<PanelAction>([
      ...candidates,
      ...fixed.map(([action, key]) => ({ action, keys: [key] }))
    ]);
  }

  actionFor(data: string): PanelAction | undefined {
    if (isKeyRelease(data)) return undefined;

    return this.bindings().find(({ key }) => matchesKey(data, key))?.action;
  }

  private key(action: PanelAction): string | undefined {
    const binding = this.bindings().find((candidate) => candidate.action === action);

    return binding && formatKeyLabel(binding.key);
  }

  hint(action: PanelAction, label: string): string {
    const key = this.key(action);

    return key ? `${key} ${label}` : `${label} unavailable`;
  }

  navigationHints(label: string): string[] {
    return navigationHints(this.key("up"), this.key("down"), label);
  }

  scrollHints(): string[] {
    const first = this.key("first");
    const last = this.key("last");

    return [
      ...this.navigationHints("scroll"),
      ...navigationHints(this.key("pageUp"), this.key("pageDown"), "page"),
      ...(first && last
        ? [`${first}/${last} first/last`]
        : [this.hint("first", "first"), this.hint("last", "last")])
    ];
  }
}
