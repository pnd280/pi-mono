# Cooperative search

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/text-search`](index.ts) exports `normalizeSearchAsync` and `searchText` for large inputs.

Normalization yields during whitespace processing, preserving whole-string Unicode case rules without terminal sanitization. Search yields within literal/fuzzy scans, including individual records; chunks do not affect matches/scores. Returns caller items with stable ties, or `[]` when `current()` is false.

## Caller responsibilities

Populate items' `normalized` fields before searching. `normalizeSearchAsync(text, signal)` rejects with the signal reason on cancellation.

Pass `searchText` a `current` callback that returns `false` when results are no longer relevant. A [latest task](../latest-task/README.md) can supply this callback and prevent stale results from being applied.

Choose which text to search and keep exact source separate from terminal-safe display text. Prompt manager's [item preparation](../../../extensions/pi-prompt-manager/src/search.ts) sanitizes display text before normalizing it for search.

## Validation

For changes to cooperative search or item preparation, use prompt manager's [interaction measurement and responsiveness check](../../../extensions/pi-prompt-manager/docs/validation.md#interaction-measurement).
