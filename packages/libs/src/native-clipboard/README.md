# Native clipboard

[Library index](../../README.md#usage)

## Behavior

[`copyNative`](index.ts) (`@pi-mono/libs/native-clipboard`) replaces the native clipboard with exact UTF-8 through local helpers, never OSC 52. The default 5,000 ms timeout covers all attempts. Cancellation may throw the signal reason; only `NativeClipboardError` messages are display-safe.

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

## Usage

```ts
import { copyNative } from "@pi-mono/libs/native-clipboard";

await copyNative(exactText, signal);
```

Override the timeout with `copyNative(exactText, signal, { timeout: 10000 })`.

## Validation

Use the [package validation commands](../../README.md#validation) and [isolated native clipboard checks](../../../extensions/pi-prompt-manager/docs/validation.md#native-clipboard). Tests capture helper stdin without changing the system clipboard.
