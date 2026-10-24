import type { KeyId } from "@earendil-works/pi-tui";
import { KeyControls, type KeybindingSource, type KeyControl } from "@pi-mono/libs/tui/keybindings";

export type PanelKeys = KeybindingSource;

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
  private readonly controls: KeyControls<PanelAction>;

  constructor(keys: PanelKeys, kind: PanelKind) {
    const fixed: [PanelAction, KeyId][] =
      kind === "panel"
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

    this.controls = new KeyControls<PanelAction>(keys, [
      ...configured
        .filter(([action]) =>
          action === "confirm" ? kind === "panel" : action !== "expand" || kind === "task"
        )
        .map(([action, id]): KeyControl<PanelAction> => ({
          action,
          id,
          // Leave copying and interruption to the host, as the shared browser does.
          ...(action === "cancel" ? { exclude: (key: KeyId) => key === "ctrl+c" } : {})
        })),
      ...fixed.map(([action, key]) => ({ action, key }))
    ]);
  }

  actionFor(data: string): PanelAction | undefined {
    return this.controls.actionFor(data);
  }

  hint(action: PanelAction, label: string): string {
    return this.controls.hint(action, label);
  }

  navigationHints(label: string): string[] {
    return this.controls.navigationHints("up", "down", label);
  }

  scrollHints(): string[] {
    const first = this.controls.label("first");
    const last = this.controls.label("last");

    return [
      ...this.navigationHints("scroll"),
      ...this.controls.navigationHints("pageUp", "pageDown", "page"),
      ...(first && last
        ? [`${first}/${last} first/last`]
        : [this.hint("first", "first"), this.hint("last", "last")])
    ];
  }
}
