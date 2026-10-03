# Cooperative search

[Library index](../../README.md#usage)

Search large inputs without blocking the event loop.

## Behaviour

[`@pi-mono/libs/text-search`](index.ts) exports `normalizeSearchAsync` and `searchText` for large inputs.

Normalisation yields during whitespace processing, preserving whole-string Unicode case rules without terminal sanitisation or Unicode canonicalisation.

Search orders phrase matches before matches containing every literal term, then fuzzy matches with Pi-compatible scores. It yields within literal and fuzzy scans, including individual records; chunking does not affect matches or scores. Results retain caller items and stable ties. An empty query returns the original array, and stale work returns `[]` when `current()` is false.

## Caller responsibilities

Populate items' `normalized` fields before searching. `normalizeSearchAsync(text, signal)` rejects with the signal reason on cancellation.

Pass `searchText` a `current` callback that returns `false` when results are no longer relevant. A [latest task](../latest-task/README.md) can supply this callback and prevent stale results from being applied.

Choose which text to search and keep exact source separate from terminal-safe display text. Prompt manager's [item preparation](../../../extensions/pi-prompt-manager/src/search.ts) sanitises display text before normalising it for search.

## Validation

Query preparation, categories, scores, and checkpoint accounting belong to the internal [ranking implementation](ranking.ts), not package exports.

- Unit coverage follows the [library Must not regress invariants](../../docs/testing.md#must-not-regress); search has no standalone unit suite.

For changes to cooperative search or item preparation, use prompt manager's [interaction measurement and responsiveness check](../../../extensions/pi-prompt-manager/docs/validation.md#interaction-measurement).
