# Terminal text

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/terminal-text`](index.ts) exports `displayText`, `styledOutput`, and `hasUnsafeTerminalControls`.

`displayText` prepares plain terminal-safe text. `styledOutput` preserves SGR styling while removing other terminal sequences. Both normalize CRLF and CR to LF and expand tabs to four spaces.

`hasUnsafeTerminalControls` detects DEL and all C0 and C1 controls except tab, LF, and CR. It does not modify source.

## Caller responsibilities

Keep exact source separate from display text. Pass complete output snapshots because terminal sequences can cross chunk boundaries. Search normalization does not sanitize terminal controls.

Choose refusal messages and editor policy. Sanitizing display text does not make the original safe to restore into an editor.

## Validation

Use the [package checks](../../../README.md#validation).
