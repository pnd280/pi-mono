# Diff view

[Shared TUI](../../README.md#usage)

## Behaviour

Showing a patch inside Pi needs rows that fit the terminal and respect expansion budgets. [`renderDiffPanel`](index.ts) renders parsed patches as a full-width panel of terminal rows.

- The panel shows a split view when the patch has both additions and removals and the width allows it; otherwise it shows a unified view.
- Replacements align within change blocks, never across context or hunk separators.
- Text is sanitised before highlighting.
- Compact budgets count changed rows, not context or structural markers. Expansion includes all supplied hunks.
- Patches remain unmodified.

Every row is exactly the supplied width. For padding, theme colours, and the strips that show header rows, hunk numbers, and footer rows, see the [diff panel layout guide](../../../../docs/tui-diff-view.md).

## Caller responsibilities

- Patch parsing and patch types belong to [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts).
- Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffPanel`.
- Choose the source byte limit before parsing and handle an `undefined` result as an unavailable patch.
- Callers supply width, expansion state, an expansion hint, a [`DiffViewTheme`](index.ts), and trusted syntax highlighting.
- Choose valid [row budgets](index.ts) before rendering. Invalid budgets throw a `RangeError`.
- Own labels, totals, empty/unavailable messages, outcomes, expansion keys, loading, and retention. Pass totals and notes as styled header and footer rows.
