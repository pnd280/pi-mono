# Native clipboard

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/native-clipboard`](index.ts) exports `copyNative`, which replaces the native clipboard with exact UTF-8 text through local helpers. There is no OSC 52 fallback.

The default 5,000 ms timeout covers all helper attempts. Cancellation can throw the signal's reason. Only `NativeClipboardError` messages are safe to display.

## Caller responsibilities

Copying requires a local clipboard session and an installed helper:

| Platform        | Helper                                                |
| --------------- | ----------------------------------------------------- |
| macOS           | `pbcopy`                                              |
| Linux (Wayland) | `wl-copy`, with `WAYLAND_DISPLAY` set                 |
| Linux (X11)     | `xclip` or `xsel`, with `DISPLAY` set                 |
| WSL             | `powershell.exe` with Windows Forms clipboard support |

SSH sessions and native Windows are unsupported.

Supply exact source text and a cancellation signal. Define a safe diagnostic for exceptions other than `NativeClipboardError`.

## Usage

```ts
import { copyNative } from "@pi-mono/libs/native-clipboard";

await copyNative(exactText, signal);
```

Override the timeout with `copyNative(exactText, signal, { timeout: 10000 })`.

## Validation

Use the [package validation commands](../../README.md#validation) and [isolated native clipboard checks](../../../extensions/pi-prompt-manager/docs/validation.md#native-clipboard). Tests capture helper stdin without changing the system clipboard.
