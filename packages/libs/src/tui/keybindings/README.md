# Keybinding normalisation

[Shared TUI](../README.md#usage)

## Behaviour

Extension settings accept user-typed shortcuts that must match Pi's canonical form. [`canonicalKeySchema`](index.ts) validates and normalises Pi shortcuts, aliases, and modifier order. Invalid input fails validation.

`resolveKeybindings` assigns keys to actions in candidate order, so dispatch and hints share one precedence. Each action gets those of its keys that are valid, not excluded by its `exclude` callback, and not taken by an earlier action.

It also checks Pi's legacy input aliases against the active terminal protocol and platform. For example, **Escape** and **Ctrl+[** both match an Escape byte, so assigning **Ctrl+[** to an earlier action makes **Escape** unavailable to later actions. This prevents hints from advertising keys that dispatch to an earlier action.

Pi 1.4.0 cannot dispatch modified Escape or modified function keys. Validation rejects these bindings. `resolveKeybindings` skips them when choosing alternatives, so hints do not advertise unusable keys.

A final `+` names the plus key, as in `+` or `ctrl++`. Pi 1.4.0 dispatches these bindings; `ctrl++` needs the Kitty keyboard protocol or modifyOtherKeys.

Pi 1.4.0 matches a symbol binding such as `ctrl++` against the Shift press that types the symbol, such as `ctrl+shift+=`. The keyboard layout decides which key types which symbol. `resolveKeybindings` therefore treats a symbol binding and any Shift binding of a digit or symbol with the same other modifiers as one key, and skips the later one. It can skip a binding that does not overlap on the current layout.

`keysOverlap` tells whether one keypress can match two canonical keys, by the same equality, legacy-input, and Shift-symbol rules. `resolveKeybindings` and [lifecycle shortcut claims](../../lifecycle/README.md#shortcut-claims) use it.

`formatKeyLabel` turns a canonical key into a hint label, such as `Ctrl+Shift+Up`, `Esc`, or `Del`.

`navigationHints` combines the labels of a paired up and down action into hints. Two available keys share one hint, and the plain arrow keys show as `↑↓`. A missing key gives its direction an "unavailable" hint, so remapped or unbound keys are never shown as arrows.

## Caller responsibilities

- Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.
