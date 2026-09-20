# Cooperative text layout

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-layout`](index.ts) prepares complete wrapped text for asynchronous callers.

`layoutPreview(text, width, current)` yields between batches, checking `current` after each yield; cancellation returns `[]`. Layout preserves chunk-boundary surrogate pairs and a final blank row for empty input/trailing newlines.

## Caller responsibilities

Supply terminal-safe text and `current` returning false to stop. Own source retention and completed-result relevance.

[Text preview](../components/text-preview/README.md) handles layout caching, stale-result suppression, scroll offsets, and disposal. Direct callers must handle those tasks themselves. Row budgets and synchronous excerpts belong to [text budget](../text-budget/README.md).

## Validation

Use the [package validation commands](../../../README.md#validation).
