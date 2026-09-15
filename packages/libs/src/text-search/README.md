# Cooperative search

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/text-search`](index.ts) exports `normalizeSearchAsync` and `searchText` for large inputs.

Normalization yields during whitespace processing while preserving whole-string Unicode case rules. It does not sanitize terminal text.

Search yields during literal and fuzzy scans, including within individual records. Chunk boundaries do not change matches or scores. Search returns the caller's items, with stable input order for tied ranks, or an empty array when `current()` returns `false`.

## Caller responsibilities

Store normalized text in each item's `normalized` field before searching. To cancel normalization, pass an abort signal to `normalizeSearchAsync(text, signal)`. Cancellation rejects with the signal's reason.

Pass `searchText` a `current` callback that returns `false` when results are no longer relevant. A [latest task](../latest-task/README.md) can supply this callback and prevent stale results from being applied.

Choose which text to search and keep exact source separate from terminal-safe display text. Prompt manager's [item preparation](../../../extensions/pi-prompt-manager/src/search.ts) sanitizes display text before normalizing it for search.

## Validation

Use the [package validation commands](../../README.md#validation). For changes to cooperative search or item preparation, also use prompt manager's [interaction measurement and responsiveness check](../../../extensions/pi-prompt-manager/docs/validation.md#interaction-measurement).
