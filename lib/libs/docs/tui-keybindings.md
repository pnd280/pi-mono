# Keybinding overlap and Pi dispatch limits

[Keybinding normalisation](../src/tui/keybindings/README.md) · [Shared TUI](../src/tui/README.md)

This guide is for callers who need to know why `resolveKeybindings` skips a key, or why validation rejects one. It records the Pi 1.4.0 dispatch rules that the [keybinding helpers](../src/tui/keybindings/index.ts) model. The [compatibility checklist](pi-compatibility.md#tui) tracks them on Pi upgrades.

## Keys that overlap

`keysOverlap` tells whether one keypress can match two canonical keys: equal keys overlap, and so do keys that the legacy-input and Shift-symbol rules below join. `resolveKeybindings` and [lifecycle shortcut claims](../src/lifecycle/phases.md#shortcut-claims) use it.

### Legacy input aliases

`resolveKeybindings` checks Pi's legacy input aliases against the active terminal protocol and platform. For example, **Escape** and **Ctrl+[** both match an Escape byte, so assigning **Ctrl+[** to an earlier action makes **Escape** unavailable to later actions. This prevents hints from advertising keys that dispatch to an earlier action.

### Shift and symbols

Pi 1.4.0 matches a symbol binding such as `ctrl++` against the Shift press that types the symbol, such as `ctrl+shift+=`. The keyboard layout decides which key types which symbol. `resolveKeybindings` therefore treats a symbol binding and any Shift binding of a digit or symbol with the same other modifiers as one key, and skips the later one. It can skip a binding that does not overlap on the current layout.

## Keys that Pi cannot dispatch

Pi 1.4.0 cannot dispatch modified Escape or modified function keys. Validation rejects these bindings. `resolveKeybindings` skips them when choosing alternatives, so hints do not advertise unusable keys.

## The plus key

A final `+` names the plus key, as in `+` or `ctrl++`. Pi 1.4.0 dispatches these bindings; `ctrl++` needs the Kitty keyboard protocol or modifyOtherKeys.
