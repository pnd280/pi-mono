# Diff view

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/diff-view`](index.ts) renders parsed patches as terminal rows.

`pairPatchLines` aligns replacements within a change block. Context separates blocks, and `renderDiffBody` pairs each hunk independently.

`renderDiffBody` renders responsive unified or split layouts with line-number gutters, row backgrounds, and bounded inline-change comparison. It normalizes patch text through [`displayText`](../../terminal-text/index.ts) before highlighting.

Compact rendering selects changed rows with surrounding context and excerpts long lines around the change. The changed-row budget excludes context and structural rows. Expanded rendering includes all supplied hunks. Rendering does not mutate the parsed patch.

## Caller responsibilities

Patch parsing and patch types belong to [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts). Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffBody`. Choose the source byte limit before parsing and handle an `undefined` result as an unavailable patch.

Callers supply width, expansion state, an expansion hint, theme functions, and trusted syntax highlighting. `compactRows` must be a safe integer of at least two. `contextRows` must be a nonnegative safe integer. Invalid budgets throw `RangeError`.

Callers supply file labels, change totals, empty or unavailable messages, and tool-outcome annotations. They handle expansion keys, source loading, and retention.

## Validation

Use the [package validation commands](../../../../README.md#validation).
