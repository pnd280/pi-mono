# Diff view

[Shared TUI](../../README.md#usage)

## Behaviour

Showing a patch inside Pi needs rows that fit the terminal and respect expansion budgets. [`renderDiffPanel`](index.ts) renders parsed patches as a full-width panel of terminal rows.

`renderDiffPanel` aligns replacements within change blocks, never across context or hunk separators. It renders responsive unified/split views from parsed patches and sanitises text before highlighting. Compact budgets count changed rows, not context or structural markers; expansion includes all supplied hunks. Patches remain unmodified.

### Panel layout

- Every row is exactly the supplied width. The `toolPendingBg` surface covers context rows, gaps, and separators. When the width exceeds two columns, the panel has one column of padding on each side.
- Strip, added-row, and removed-row backgrounds mix the surface toward `toolDiffContext`, `toolDiffAdded`, and `toolDiffRemoved`. The resulting contrast depends on those colours and the terminal's colour mode. A changed row's background also colours the adjacent padding column.
- A top strip shows the caller's header rows. With more than one hunk, its first row also shows the first hunk's position when both fit. Caller text takes priority over the position.
- A strip precedes each later hunk. It shows the hunk number and, when space permits, the start line.
- A bottom strip shows the compact notice, then the caller's footer rows.

## Caller responsibilities

- Patch parsing and patch types belong to [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts).
- Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffPanel`.
- Choose the source byte limit before parsing and handle an `undefined` result as an unavailable patch.
- Callers supply width, expansion state, an expansion hint, a [`DiffViewTheme`](index.ts), and trusted syntax highlighting.
- Choose valid [row budgets](index.ts) before rendering.
- Own labels, totals, empty/unavailable messages, outcomes, expansion keys, loading, and retention. Pass totals and notes as styled header and footer rows.
