# Browser host

[Shared TUI](../README.md#usage)

Mounting a browser needs Pi presentation, remount survival, and post-closure effects in one call. [`openBrowser`](index.ts) mounts the [collection browser](../components/browser/README.md) through [responsive custom UI](../responsive-custom-ui/README.md), using shared browser measurements to choose inline or overlay presentation.

## Behaviour

- Focused fullscreen inline views route resolved browser actions through [priority input](../responsive-custom-ui/README.md#fullscreen-input-ownership) before transcript controls.
- Overlays use ordinary Pi input delivery.
- One browser survives remounts, and `openBrowser` disposes it at final closure.
- Error-free, unaborted closure runs `afterClose` once, even without selection, after Pi restores the opening inline-editor snapshot.
- When fullscreen input routing is unavailable, the browser stays open and `openBrowser` calls `onInputRoutingUnavailable`.
- Browser action errors go to `onError`. Construction, mounting, and `afterClose` failures reject the `openBrowser` promise.

## Usage

The [collection browser usage](../components/browser/README.md#usage) shows a complete `openBrowser` call. Record the selection in an action, and act on it in `afterClose`:

```ts
await openBrowser({ ui: ctx.ui, signal, browser, onError, onInputRoutingUnavailable, afterClose });
```

## Caller responsibilities

- Supply the [host options](index.ts).
- Use `onInputRoutingUnavailable` to warn that fullscreen input routing is unavailable, and suggest regular mode if controls do not respond.
- Record selection in actions.
- Check the selection in `afterClose` before editor changes, never during remounts.
- Own session-expiry checks and operation safety.
- Handle rejections from `openBrowser`.

Related: the [shared TUI validation](../README.md#validation) lists the host tests for paging, remounts, and cancellation, and the focus routing tests.
