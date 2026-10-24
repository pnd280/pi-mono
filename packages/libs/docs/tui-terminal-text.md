# Terminal text styling rules

[Terminal text](../src/tui/terminal-text/README.md) · [Shared TUI](../src/tui/README.md)

This guide is for callers who need to know which styling survives [`styledOutput`](../src/tui/terminal-text/index.ts), and for renderers that wrap or slice styled text with the [text budget](../src/tui/text-budget/README.md) helpers.

## Retained SGR styling

`styledOutput` retains the Select Graphic Rendition (SGR) dialect that Pi 1.4.0 reconstructs on continuation rows and sliced suffixes:

| Styling    | Retained parameters                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attributes | Bold, dim, italic, underline, blink, inverse, hidden, and strikethrough use `1`–`5` and `7`–`9`.                                                                                                                                          |
| Resets     | A full reset uses an empty sequence or `0`; attribute resets use `21`–`25` and `27`–`29`; default colours use `39` and `49`.                                                                                                              |
| Colours    | Standard and bright foreground and background colours use `30`–`37`, `40`–`47`, `90`–`97`, and `100`–`107`. Indexed and RGB colours use semicolon groups beginning with `38;5`, `48;5`, `38;2`, or `48;2`, with values from `0` to `255`. |

## Removed parameters

- `styledOutput` removes other parameters, including colon-form colours, underline styles, and underline colours.
- It consumes colour groups together so their values cannot become unrelated attributes.
- An unknown colour mode removes the rest of that SGR sequence.
- It normalises supported numeric values without changing their style.
- Suffix reconstruction uses the same filtering and retains bounded style state.
