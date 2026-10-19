# Browser host

[Shared TUI](../README.md#usage)

## Behaviour

Mounting a browser needs Pi presentation, remount survival, and post-closure effects in one call. [`openBrowser`](index.ts) mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

- Focused fullscreen inline views route resolved browser actions through [priority input](../responsive-custom-ui/README.md#fullscreen-input-ownership) before transcript controls.
- Overlays use ordinary Pi input delivery.
- One browser survives remounts, and `openBrowser` disposes it at final closure.
- Error-free, unaborted closure runs `afterClose` once, even without selection, after Pi restores the opening inline-editor snapshot.
- When fullscreen input routing is unavailable, the browser stays open and `openBrowser` calls `onInputRoutingUnavailable`.
- Browser action errors go to `onError`. Construction, mounting, and `afterClose` failures reject the `openBrowser` promise.

## Caller responsibilities

- Supply the [host options](index.ts).
- Use `onInputRoutingUnavailable` to warn that fullscreen input routing is unavailable, and suggest regular mode if controls do not respond.
- Record selection in actions.
- Check the selection in `afterClose` before editor changes, never during remounts.
- Own session-expiry checks and operation safety.
- Handle rejections from `openBrowser`.

## Validation

Use the [package checks](../../../README.md#validation). [Host tests](index.test.ts) cover paging, remounts, and cancellation. Tests of focus routing are in [responsive custom UI](../responsive-custom-ui/README.md#validation).
