# Terminal text

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/terminal-text`](index.ts) exports `displayText`, `compactDisplayText`, `styledOutput`, `sliceTerminalText`, and `hasUnsafeTerminalControls`.

`displayText` makes plain terminal-safe text; `styledOutput` retains only SGR styling. Both normalize CRLF/CR to LF and tabs to four spaces.

`compactDisplayText` makes a single-line plain label by replacing CR/LF/tabs with spaces before sanitizing and collapsing repeated spaces. It does not trim or limit length.

`sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for a start-inclusive/end-exclusive UTF-16 range, preserving graphemes/recognized sequences, possibly omitting boundary graphemes. Recognized escape boundaries take precedence so a following combining mark cannot split a complete sequence. `preserveSgr: true` supplies the active SGR prefix for independent styling; otherwise `leadingSgr` is empty.

`hasUnsafeTerminalControls` detects DEL and all C0 and C1 controls except tab, LF, and CR. It does not modify the source.

## Caller responsibilities

Keep exact source separate. Slice/sanitize complete snapshots, not chunks: sequences cross boundaries. Search normalization does not sanitize controls.

`sliceTerminalText` does not sanitize its result. Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.

Choose refusal messages and editor policy. Sanitizing display text does not make the original safe to restore into an editor.

## Validation

Use the [package checks](../../../README.md#validation).
