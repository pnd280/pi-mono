# Browser host

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/open-browser`](index.ts) exports `openBrowser`. It mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

Focused fullscreen inline lists, previews, and inspection use [priority paging](../responsive-custom-ui/README.md#fullscreen-input-ownership) without scrolling the transcript. Short-terminal overlays use ordinary Pi input delivery.

One browser survives remounts. Abort closes immediately, even during overlay mounting, blocking late updates; final closure disposes. Old adapters cannot affect replacement presentations.

Error-free, unaborted closure runs `afterClose` once, even for user cancellation without selection, after Pi restores the opening inline-editor snapshot. Redraws occur after invocation and settlement so synchronous editor changes need not wait for I/O.

## Caller responsibilities

Supply a UI object with `custom`, a cancellation signal, browser options, `onError`, and `onInputRoutingUnavailable`. Use `onInputRoutingUnavailable` to warn that fullscreen paging is unavailable and suggest arrow navigation. It runs at most once per opening; the browser stays open.

Record selection in actions; check it in `afterClose` before editor changes, never during remounts. Own session-expiry checks and operation safety.

Handle rejections from `openBrowser` for construction, mounting, or `afterClose` failures. Browser action errors use `onError`.

## Validation

Use the [package checks](../../../README.md#validation). [Host tests](index.test.ts) drive the real fullscreen renderer's terminal callback to check list, preview, and inspection paging, responsive remounts, and restored transcript paging. They also cover stale callbacks, deferred mounting, cancellation, and editor snapshot ordering. Search and competing-dialog focus tests belong to [responsive custom UI](../responsive-custom-ui/README.md#validation).
