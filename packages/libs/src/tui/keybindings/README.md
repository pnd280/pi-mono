# Keybinding normalisation

[Shared TUI](../README.md#usage)

Extension settings accept user-typed shortcuts that must match Pi's canonical form, and each view needs one precedence for dispatch and hints. [`canonicalKeySchema`](index.ts) validates and normalises shortcuts, `resolveKeybindings` assigns them to actions, and `KeyControls` gives a view its dispatch and hints from Pi keybindings and fixed keys.

## Behaviour

- `canonicalKeySchema` normalises Pi shortcuts, aliases, and modifier order. Invalid input fails validation.
- Validation rejects modified Escape and modified function keys, because Pi 1.4.0 cannot dispatch them.
- `resolveKeybindings` assigns keys to actions in candidate order, so dispatch and hints share one precedence. Each action gets those of its keys that are valid, not excluded by its `exclude` callback, and not taken by an earlier action.
- A key is taken when it overlaps an earlier key, for example when **Ctrl+[** and **Escape** send the same byte. `keysOverlap` applies the same test.
- `formatKeyLabel` turns a canonical key into a hint label, such as `Ctrl+Shift+Up`, `Esc`, or `Del`. A letter without modifiers stays lowercase, such as `a`, because a capital letter reads as Shift plus that letter.
- `navigationHints` combines the labels of a paired up and down action into hints. Two available keys share one hint, and arrow keys with the same modifiers show as `↑↓` or, for example, `Shift+↑↓`. A missing key gives its direction an "unavailable" hint, so remapped or unbound keys are never shown as arrows.
- `KeyControls` resolves a view's ordered controls at each call, so dispatch and hints follow live keybinding changes. A control names a Pi keybinding, with an optional `exclude` callback, or one fixed key. `actionFor` ignores key releases, `label` formats an action's first key, and `hint` shows `<key> <label>`, or `<label> unavailable` when no key reaches the action.

| When you…                                                           | Read                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Need to know why a key is skipped, or bind the plus key or a symbol | [Keybinding overlap and Pi dispatch limits](../../../docs/tui-keybindings.md) |

## Usage

```ts
import {
  canonicalKeySchema,
  formatKeyLabel,
  KeyControls,
  navigationHints,
  resolveKeybindings
} from "@pi-mono/libs/tui/keybindings";

canonicalKeySchema.parse("Shift+Ctrl+Up"); // "ctrl+shift+up"
formatKeyLabel("ctrl+shift+up"); // "Ctrl+Shift+Up"
navigationHints("Up", "Down", "select"); // ["↑↓ select"]

resolveKeybindings([
  { action: "back", keys: ["ctrl+["] },
  { action: "cancel", keys: ["escape", "ctrl+q"] }
]);
// Without the Kitty keyboard protocol, Ctrl+[ takes Escape:
// [{ action: "back", key: "ctrl+[" }, { action: "cancel", key: "ctrl+q" }]

// `keys` is the KeybindingsManager that Pi passes to custom UI.
const controls = new KeyControls(keys, [
  { action: "save", key: "ctrl+s" },
  { action: "close", id: "tui.select.cancel" },
  { action: "up", id: "tui.select.up" },
  { action: "down", id: "tui.select.down" }
]);
controls.actionFor(data); // "save", "close", "up", "down", or undefined
controls.hint("save", "save"); // "Ctrl+S save"
controls.navigationHints("up", "down", "select"); // ["↑↓ select"] with Pi's default keys
```

## Caller responsibilities

- Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.
- Order controls by precedence within the view. Put reserved actions, such as save and close, before Pi keybindings that a user can remap onto them.
- Account for [fullscreen input ownership](../responsive-custom-ui/README.md#fullscreen-input-ownership). This helper does not change which keys the host delivers to the view.

Related: [lifecycle shortcut claims](../../lifecycle/phases.md#shortcut-claims) use `keysOverlap` across extensions.
