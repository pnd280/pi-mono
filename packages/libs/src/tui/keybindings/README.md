# Keybinding normalisation

[Shared TUI](../README.md#usage)

## Behaviour

Extension settings accept user-typed shortcuts that must match Pi's canonical form. [`canonicalKeySchema` and `canonicalKey`](index.ts) validate and normalise Pi shortcuts, aliases, and modifier order. Invalid input makes `canonicalKey` return `undefined`.

Pi 1.0.1 cannot dispatch literal-plus shortcuts (`+`, `ctrl++`), modified Escape, or modified function keys. Validation rejects these bindings. `resolveKeybindings` skips them when choosing alternatives, so hints do not advertise unusable keys.

## Caller responsibilities

Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.
