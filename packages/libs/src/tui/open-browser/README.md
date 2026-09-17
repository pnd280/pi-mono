# Browser host

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/open-browser`](index.ts) exports `openBrowser`. It mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

The same logical browser survives each remount. Aborting the signal closes the browser immediately and prevents late results from updating it, even while an overlay is still mounting. Final closure disposes the browser. Old host adapters cannot act on a replacement presentation.

When the host closes without an error, `afterClose` runs once unless the signal was aborted. It also runs when the user cancels without selecting an item. Pi has already restored the inline editor's opening snapshot by that point.

The helper requests redraws after invoking `afterClose` and when it settles. Synchronous editor changes therefore appear without waiting for subsequent I/O.

## Caller responsibilities

Supply a UI object with `custom`, a cancellation signal, browser options, and an error callback.

Record the selected item in browser actions. In `afterClose`, check that an item was selected before applying editor changes. Never apply those changes during a remount. The extension remains responsible for session-expiry checks and operation safety.

Handle rejections from `openBrowser` for construction, mounting, or `afterClose` failures. Browser action errors use `onError`.

## Validation

Use the [package checks](../../../README.md#validation). Host tests cover transitions between inline and overlay modes, stale callbacks, deferred mounting, cancellation, and editor snapshot ordering.
