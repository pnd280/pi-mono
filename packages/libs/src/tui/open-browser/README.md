# Browser host

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/open-browser`](index.ts) exports `openBrowser`. It mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

One browser survives remounts. Abort closes immediately, even during overlay mounting, blocking late updates; final closure disposes. Old adapters cannot affect replacement presentations.

Error-free, unaborted closure runs `afterClose` once, even for user cancellation without selection, after Pi restores the opening inline-editor snapshot. Redraws occur after invocation and settlement so synchronous editor changes need not wait for I/O.

## Caller responsibilities

Supply a UI object with `custom`, a cancellation signal, browser options, and an error callback.

Record selection in actions; check it in `afterClose` before editor changes, never during remounts. Own session-expiry checks and operation safety.

Handle rejections from `openBrowser` for construction, mounting, or `afterClose` failures. Browser action errors use `onError`.

## Validation

Use the [package checks](../../../README.md#validation). Host tests cover transitions between inline and overlay modes, stale callbacks, deferred mounting, cancellation, and editor snapshot ordering.
