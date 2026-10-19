# Bounded code highlighting

[Shared TUI](../../README.md#usage)

## Behaviour

Highlighting an unbounded file with Pi syntax highlighting risks slow renders. [`highlightCodeBounded`](index.ts) limits Pi syntax highlighting by total bytes, line count, and bytes per line.

An explicit language overrides path detection. If no language applies or the input exceeds a limit, the text comes back unchanged. Generated ANSI does not count toward the limits. Limits that are not nonnegative safe integers throw a `RangeError`.

`highlightCodeSelection(source, options)` sanitises the source, applies the limits, and then applies `mark(text)` to each selected range. It returns `{ text, hasSelection }`, where `hasSelection` is true when at least one range marks visible text. Marks still apply when the input exceeds highlighting limits, and they never split escape sequences or graphemes. A selection of only invisible characters never marks its neighbours.

## Caller responsibilities

- Retain original source separately for exact copying or restoration.
- Pass display-safe text to `highlightCodeBounded`, because it does not sanitise terminal controls.
- Pass unsanitised source to `highlightCodeSelection`.
- Supply ordered, nonoverlapping ranges with a zero-based `line` index and UTF-16 offsets within that line. `start` is inclusive and `end` is exclusive.
- Make `mark` preserve text and restore the caller's background after selection styling.
- Choose the language and limits before rendering; see the [validated options](index.ts).

## Validation

Use [package validation](../../../../README.md#validation). Tests cover [unchanged-input fallback at highlighting limits](index.test.ts).
