# Terminal text

[Shared TUI](../README.md#usage)

## Behaviour

Untrusted terminal output can carry control sequences that corrupt the display. Use [`displayText`](index.ts) for untrusted plain text and `styledOutput` to retain only SGR styling. Both normalise line endings and tabs.

`compactDisplayText` makes a single-line plain label without trimming or limiting length.

`sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for the UTF-16 range from `start` (inclusive) to `end` (exclusive). It never splits graphemes or recognised escapes; a grapheme straddling a boundary is omitted instead. Set `preserveSgr: true` to carry active SGR styling into a slice shown on its own.

`hasUnsafeTerminalControls` detects DEL and C0 and C1 controls except tab, LF, and CR without modifying the source.

## Caller responsibilities

- Keep exact source separate.
- Slice and sanitise complete snapshots, not chunks, because escape sequences can cross chunk boundaries.
- Search normalisation does not sanitise controls.
- `sliceTerminalText` does not sanitise its result.
- Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.
- Choose refusal messages and editor policy.
- Sanitising display text does not make the original safe to restore into an editor.
