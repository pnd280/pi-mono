# Cooperative text layout

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-layout`](index.ts) prepares complete wrapped text for asynchronous callers.

`layoutPreview(text, width, current)` returns the same rows as `wrapTextWithAnsi(text, Math.max(1, width))`, including whitespace, graphemes, ANSI state, and empty/trailing logical lines.

Source scanning uses bounded forward-only windows and yields between batches, checking `current` after each yield; cancellation returns `[]`, never partial rows. Wrapping batches end at complete logical lines (LF, CRLF, or CR), so Pi receives intact source rather than previously wrapped rows. Each individual logical line is wrapped synchronously by Pi; cancellation cannot interrupt that native call.

## Caller responsibilities

Supply terminal-safe text and `current` returning false to stop. Own source retention and completed-result relevance.

[Text preview](../components/text-preview/README.md) handles layout caching, stale-result suppression, scroll offsets, and disposal. Direct callers must handle those tasks themselves. Row budgets and synchronous excerpts belong to [text budget](../text-budget/README.md).

## Validation

Use the [package validation commands](../../../README.md#validation).
