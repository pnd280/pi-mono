# Fullscreen input host compatibility

[Responsive custom UI](../src/tui/responsive-custom-ui/README.md#host-compatibility) · [Shared TUI](../src/tui/README.md)

This guide is for maintainers who change the [priority input adapter](../src/tui/responsive-custom-ui/fullscreen-input.ts) or recheck it after a Pi upgrade. The [fullscreen input ownership](../src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership) contract describes what callers see.

## Renderer contract

The [compatibility checklist](pi-compatibility.md#tui) records the Pi version last checked. The private adapter depends on these internal renderer properties:

- An ordered `inputListeners` Set with callable entries. Installation must not reorder the Set during traversal, which could deliver input twice.
- `getFocusedComponent()` and `getVisibleOverlayFocusRestore()` to avoid intercepting dialog input, including during focus restoration.
- Property reads through the stable TUI proxy, whose descriptors may be replaced independently of the current renderer.

## Registration lifetime

Registrations belong to host presentations, not the logical component retained across remounts. Cleanup must preserve unrelated listeners.

## Why the adapter is private

Public terminal listeners append after Pi's fullscreen transcript listener and cannot preempt it. Replace this adapter when a public API provides equivalent focus-scoped priority.
