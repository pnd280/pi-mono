# Terminal text

[Shared TUI](../README.md#usage)

## Behaviour

Untrusted terminal output can carry control sequences that corrupt the display. Use [`displayText`](index.ts) for untrusted plain text and `styledOutput` to retain only Select Graphic Rendition (SGR) styling. Both normalise line endings and tabs.

`displayText` removes complete control sequence introducer (CSI) commands. For unrecognised non-CSI escapes, printable payload text can remain after control bytes are removed.

`compactDisplayText` makes a single-line plain label without trimming or limiting length.

`sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for the UTF-16 range from `start` (inclusive) to `end` (exclusive). It never splits graphemes or recognised escapes; a grapheme straddling a boundary is omitted instead. Set `preserveSgr: true` to reconstruct leading styling with Pi's SGR tracker.

`styledOutput` retains the SGR dialect that Pi 1.3.0 reconstructs on continuation rows and sliced suffixes:

| Styling    | Retained parameters                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attributes | Bold, dim, italic, underline, blink, inverse, hidden, and strikethrough use `1`–`5` and `7`–`9`.                                                                                                                                          |
| Resets     | A full reset uses an empty sequence or `0`; attribute resets use `21`–`25` and `27`–`29`; default colours use `39` and `49`.                                                                                                              |
| Colours    | Standard and bright foreground and background colours use `30`–`37`, `40`–`47`, `90`–`97`, and `100`–`107`. Indexed and RGB colours use semicolon groups beginning with `38;5`, `48;5`, `38;2`, or `48;2`, with values from `0` to `255`. |

Other parameters, including colon-form colours, underline styles, and underline colours, are removed. Colour groups are consumed together so their values cannot become unrelated attributes. An unknown colour mode removes the rest of that SGR sequence. Supported numeric values are normalised without changing their style.

Suffix reconstruction uses the same filtering and retains bounded style state.

`hasUnsafeTerminalControls` detects DEL and C0 and C1 controls except tab, LF, and CR without modifying the source.

## Caller responsibilities

- Keep exact source separate.
- Slice and sanitise complete snapshots, not chunks, because escape sequences can cross chunk boundaries.
- Search normalisation does not sanitise controls.
- `sliceTerminalText` does not sanitise its result.
- Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.
- Choose refusal messages and editor policy.
- Sanitising display text does not make the original safe to restore into an editor.
