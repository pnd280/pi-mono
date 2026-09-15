# Cooperative text layout

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-layout`](index.ts) prepares complete wrapped text for asynchronous callers.

`layoutPreview(text, width, current)` yields to the event loop between wrapping batches and checks `current` after each yield. Cancellation returns an empty array.

Layout preserves surrogate pairs at chunk boundaries and retains a final blank row for empty input or a trailing newline.

## Caller responsibilities

Callers supply terminal-safe text and a `current` callback that returns `false` when work should stop. They manage source retention and decide whether a completed layout is still relevant.

[Text preview](../components/text-preview/README.md) handles layout caching, stale-result suppression, scroll offsets, and disposal. Direct callers must handle those tasks themselves. Row budgets and synchronous excerpts belong to [text budget](../text-budget/README.md).

## Validation

Use the [package validation commands](../../../README.md#validation).
