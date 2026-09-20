# Keybinding normalization

[Shared TUI](../README.md#usage)

## Behavior

[`canonicalKeySchema` and `canonicalKey`](index.ts) (`@pi-mono/libs/tui/keybindings`) validate/normalize Pi shortcuts, aliases, and modifier order. Invalid input makes `canonicalKey` return `undefined`.

## Caller responsibilities

Own actions, defaults, diagnostics, precedence, and Pi keybinding changes.

## Validation

Use the [package checks](../../../README.md#validation).
