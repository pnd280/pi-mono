# Terminal text

[Shared TUI](../README.md#usage)

## Behavior

Use [`displayText`](index.ts) for untrusted plain text and `styledOutput` to retain only SGR styling. Both normalize line endings and tabs.

`compactDisplayText` makes a single-line plain label without trimming or limiting length.

`sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for a start-inclusive/end-exclusive UTF-16 range without splitting graphemes or recognized escapes; boundary graphemes may be omitted. Set `preserveSgr: true` to carry active SGR styling into an independently displayed slice.

`hasUnsafeTerminalControls` detects DEL and C0/C1 controls except tab, LF, and CR without modifying the source.

## Caller responsibilities

Keep exact source separate. Slice/sanitize complete snapshots, not chunks: sequences cross boundaries. Search normalization does not sanitize controls.

`sliceTerminalText` does not sanitize its result. Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.

Choose refusal messages and editor policy. Sanitizing display text does not make the original safe to restore into an editor.
