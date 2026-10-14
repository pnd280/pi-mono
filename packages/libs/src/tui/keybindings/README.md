# Keybinding normalisation

[Shared TUI](../README.md#usage)

## Behaviour

Extension settings accept user-typed shortcuts that must match Pi's canonical form. [`canonicalKeySchema` and `canonicalKey`](index.ts) validate and normalise Pi shortcuts, aliases, and modifier order. Invalid input makes `canonicalKey` return `undefined`.

Pi 1.0.1 cannot dispatch literal-plus shortcuts (`+`, `ctrl++`), modified Escape, or modified function keys. Validation rejects these bindings. `resolveKeybindings` skips them when choosing alternatives, so hints do not advertise unusable keys.

`formatKeyLabel` turns a canonical key into a hint label, such as `Ctrl+Shift+Up`, `Esc`, or `Del`.

`navigationHints` combines the labels of a paired up and down action into hints. Two available keys share one hint, and the plain arrow keys show as `↑↓`. A missing key gives its direction an "unavailable" hint, so remapped or unbound keys are never shown as arrows.

## Caller responsibilities

Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.
