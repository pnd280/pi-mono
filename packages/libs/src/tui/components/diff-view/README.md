# Diff view

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/diff-view`](index.ts) renders parsed patches as terminal rows.

`pairPatchLines` aligns replacements within context-separated change blocks. `renderDiffBody` pairs hunks independently in responsive unified/split layouts with gutters, backgrounds, and bounded inline comparison, using [`displayText`](../../terminal-text/index.ts) before highlighting.

Compact views select changed rows/context and long-line change excerpts; context/structure do not count toward changed-row budgets. Expansion includes all supplied hunks. Patches remain unmodified.

## Caller responsibilities

Patch parsing and patch types belong to [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts). Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffBody`. Choose the source byte limit before parsing and handle an `undefined` result as an unavailable patch.

Callers supply width, expansion state, an expansion hint, theme functions, and trusted syntax highlighting. `compactRows` must be a safe integer of at least two. `contextRows` must be a nonnegative safe integer. Invalid budgets throw `RangeError`.

Own labels, totals, empty/unavailable messages, outcomes, expansion keys, loading, and retention.

## Validation

Use the [package validation commands](../../../../README.md#validation).
