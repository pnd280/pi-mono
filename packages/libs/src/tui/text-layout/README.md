# Cooperative text layout

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-layout`](index.ts) prepares complete wrapped text for asynchronous callers.

`layoutPreview(text, width, current)` returns the same rows as Pi's `wrapTextWithAnsi(text, Math.max(1, width))`. It yields between complete-line batches, checking `current`; cancellation returns `[]`, never partial rows. An individual line's synchronous Pi wrapping cannot be interrupted.

## Caller responsibilities

Supply terminal-safe text and `current` returning false to stop. Own source retention and completed-result relevance.

[Text preview](../components/text-preview/README.md) handles layout caching, stale-result suppression, scroll offsets, and disposal. Direct callers must handle those tasks themselves. Row budgets and synchronous excerpts belong to [text budget](../text-budget/README.md).

## Validation

Use the [package validation commands](../../../README.md#validation).
