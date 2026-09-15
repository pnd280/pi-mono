# Keybinding normalization

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/keybindings`](index.ts) exports `canonicalKeySchema` and `canonicalKey`. They validate and normalize Pi shortcut strings, including aliases and modifier order. `canonicalKey` returns `undefined` for invalid input.

## Caller responsibilities

Choose actions, default bindings, and diagnostics. Canonicalization does not decide precedence or modify Pi's keybindings.

## Validation

Use the [package checks](../../../README.md#validation).
