# Terminal text

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/terminal-text`](index.ts) exports `displayText`, `styledOutput`, `sliceTerminalText`, and `hasUnsafeTerminalControls`.

`displayText` prepares plain terminal-safe text. `styledOutput` preserves SGR styling while removing other terminal sequences. Both normalize CRLF and CR to LF and expand tabs to four spaces.

`sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for a UTF-16 source range, with an inclusive start and exclusive end. It keeps graphemes and recognized terminal sequences intact. It may omit a boundary grapheme rather than split it.

With `preserveSgr: true`, `leadingSgr` contains the active SGR prefix needed to style the selected text independently. Otherwise, `leadingSgr` is empty.

`hasUnsafeTerminalControls` detects DEL and all C0 and C1 controls except tab, LF, and CR. It does not modify the source.

## Caller responsibilities

Keep exact source separate from display text. Slice or sanitize complete output snapshots, not individual stream chunks, because terminal sequences can cross chunk boundaries. Search normalization does not sanitize terminal controls.

`sliceTerminalText` does not sanitize its result. Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.

Choose refusal messages and editor policy. Sanitizing display text does not make the original safe to restore into an editor.

## Validation

Use the [package checks](../../../README.md#validation).
