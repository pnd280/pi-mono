# Browser host

[Shared TUI](../README.md#usage)

## Behaviour

Mounting a browser needs Pi presentation, remount survival, and post-closure effects in one call. [`openBrowser`](index.ts) mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

- Focused fullscreen inline views use [priority paging](../responsive-custom-ui/README.md#fullscreen-input-ownership) without scrolling the transcript.
- Overlays use ordinary Pi input delivery.
- One browser survives remounts and is disposed at final closure.
- Error-free, unaborted closure runs `afterClose` once, even without selection, after Pi restores the opening inline-editor snapshot.

## Caller responsibilities

- Supply the [host options](index.ts).
- Use `onInputRoutingUnavailable` to warn that fullscreen paging is unavailable and suggest arrow navigation; the browser stays open.
- Record selection in actions; check it in `afterClose` before editor changes, never during remounts.
- Own session-expiry checks and operation safety.
- Handle rejections from `openBrowser` for construction, mounting, or `afterClose` failures. Browser action errors use `onError`.

## Validation

Use the [package checks](../../../README.md#validation). [Host tests](index.test.ts) cover paging, remounts, and cancellation; focus routing is tested in [responsive custom UI](../responsive-custom-ui/README.md#validation).
