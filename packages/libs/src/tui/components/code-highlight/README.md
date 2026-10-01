# Bounded code highlighting

[Shared TUI](../../README.md#usage)

## Behaviour

Highlighting an unbounded file with Pi syntax highlighting risks slow renders. [`highlightCodeBounded`](index.ts) limits Pi syntax highlighting by total bytes, line count, and bytes per line.

Explicit language overrides path detection. Missing language or exceeded input limits returns unchanged text; generated ANSI does not count toward limits.

`highlightCodeSelection(source, options)` sanitises source, then applies limits and `mark(text)`, returning `{ text, hasSelection }` for visible selections. Marks survive exceeded highlighting limits without splitting escape sequences or graphemes; invisible-only selections never mark neighbours.

## Caller responsibilities

- Pass display-safe text to `highlightCodeBounded`. It does not sanitise terminal controls.
- Pass unsanitised source to `highlightCodeSelection`.
- Supply ordered, nonoverlapping ranges with a zero-based `line` index and UTF-16 offsets within that line; `start` is inclusive and `end` is exclusive.
- Make `mark` preserve text and restore the caller's background after selection styling.
- Choose the language and limits before rendering; see the [validated options](bounded.ts).
- Retain original source separately for exact copying or restoration.

## Validation

Use [package validation](../../../../README.md#validation). Tests cover [highlighting limits](index.test.ts) and [selection boundaries](selection.test.ts).
