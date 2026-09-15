# Bounded code highlighting

[Shared TUI](../../README.md#usage)

## Behavior

[`highlightCodeBounded`](index.ts), exported from `@pi-mono/libs/tui/components/code-highlight`, limits Pi syntax highlighting by total bytes, line count, and bytes per line.

A supplied language takes precedence over path-based detection. If neither provides a language, or the input exceeds any limit, the helper returns the input unchanged. Limits must be nonnegative safe integers and apply to input, not generated ANSI styling.

## Caller responsibilities

Pass display-safe text; the helper does not sanitize terminal controls. Choose the language and limits before rendering. Retain original source separately for exact copying or restoration.

## Validation

See [package validation](../../../../README.md#validation) and the [boundary tests](index.test.ts).
