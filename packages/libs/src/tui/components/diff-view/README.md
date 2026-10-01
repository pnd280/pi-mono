# Diff view

[Shared TUI](../../README.md#usage)

## Behaviour

Showing a patch inside Pi needs rows that fit the terminal and respect expansion budgets. [`renderDiffBody`](index.ts) renders parsed patches as terminal rows.

`renderDiffBody` aligns replacements within change blocks, never across context or hunk separators. It renders responsive unified/split views from parsed patches and sanitises text before highlighting. Compact budgets count changed rows, not context or structural markers; expansion includes all supplied hunks. Patches remain unmodified.

## Caller responsibilities

- Patch parsing and patch types belong to [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts).
- Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffBody`.
- Choose the source byte limit before parsing and handle an `undefined` result as an unavailable patch.
- Callers supply width, expansion state, an expansion hint, theme functions, and trusted syntax highlighting.
- Choose valid [row budgets](index.ts) before rendering.
- Own labels, totals, empty/unavailable messages, outcomes, expansion keys, loading, and retention.
