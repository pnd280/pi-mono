# Native clipboard

[Library index](../../README.md#usage)

Write exact UTF-8 to the system clipboard through local helpers instead of terminal escape sequences.

## Behaviour

[`copyNative`](index.ts) (`@pi-mono/libs/native-clipboard`) replaces the native clipboard with exact UTF-8 through local helpers, never OSC 52.

```ts
import { copyNative } from "@pi-mono/libs/native-clipboard";

await copyNative(exactText, signal);
```

The default 5,000 ms timeout covers all attempts. Cancellation may throw the signal reason. Only `NativeClipboardError` messages are display-safe.

## Caller responsibilities

Requires a local clipboard session and helper:

| Platform        | Helper                                                |
| --------------- | ----------------------------------------------------- |
| macOS           | `pbcopy`                                              |
| Linux (Wayland) | `wl-copy`, with `WAYLAND_DISPLAY` set                 |
| Linux (X11)     | `xclip` or `xsel`, with `DISPLAY` set                 |
| WSL             | `powershell.exe` with Windows Forms clipboard support |

SSH sessions and native Windows are unsupported.

Supply exact source and a signal; choose safe messages for non-`NativeClipboardError` exceptions.

Override the timeout with `copyNative(exactText, signal, { timeout: 10000 })`. Timeout overrides must be integers from 0 through 2,147,483,647 milliseconds.

## Validation

Use the [package validation commands](../../README.md#validation) and [isolated native clipboard checks](../../../extensions/pi-prompt-manager/docs/validation.md#native-clipboard). Tests capture helper stdin without changing the system clipboard.
