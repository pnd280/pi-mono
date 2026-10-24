# Keybinding normalisation

[Shared TUI](../README.md#usage)

Extension settings accept user-typed shortcuts that must match Pi's canonical form, and hints must show only keys that reach their action. [`canonicalKeySchema`](index.ts) validates and normalises shortcuts, and `resolveKeybindings` assigns them to actions.

## Behaviour

- `canonicalKeySchema` normalises Pi shortcuts, aliases, and modifier order. Invalid input fails validation.
- Validation rejects modified Escape and modified function keys, because Pi 1.4.0 cannot dispatch them.
- `resolveKeybindings` assigns keys to actions in candidate order, so dispatch and hints share one precedence. Each action gets those of its keys that are valid, not excluded by its `exclude` callback, and not taken by an earlier action.
- A key is taken when it overlaps an earlier key, for example when **Ctrl+[** and **Escape** send the same byte. `keysOverlap` applies the same test.
- `formatKeyLabel` turns a canonical key into a hint label, such as `Ctrl+Shift+Up`, `Esc`, or `Del`.
- `navigationHints` combines the labels of a paired up and down action into hints. Two available keys share one hint, and the plain arrow keys show as `↑↓`. A missing key gives its direction an "unavailable" hint, so remapped or unbound keys are never shown as arrows.

| When you…                                                           | Read                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Need to know why a key is skipped, or bind the plus key or a symbol | [Keybinding overlap and Pi dispatch limits](../../../docs/tui-keybindings.md) |

## Usage

```ts
import {
  canonicalKeySchema,
  formatKeyLabel,
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
```

## Caller responsibilities

- Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.

Related: [lifecycle shortcut claims](../../lifecycle/phases.md#shortcut-claims) use `keysOverlap` across extensions.
