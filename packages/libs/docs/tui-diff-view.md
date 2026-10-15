# Diff panel layout

[Diff view](../src/tui/components/diff-view/README.md) · [Shared TUI](../src/tui/README.md)

This guide describes how [`renderDiffPanel`](../src/tui/components/diff-view/index.ts) lays out the panel. Follow it when you choose a `DiffViewTheme` or header and footer rows, or when you check rendered output.

## Surface and padding

- Every row is exactly the supplied width.
- The `toolPendingBg` surface covers context rows, gaps, and separators.
- When the width exceeds two columns, the panel has one column of padding on each side.

## Row colours

- Strip, added-row, and removed-row backgrounds mix the surface toward `toolDiffContext`, `toolDiffAdded`, and `toolDiffRemoved`.
- The resulting contrast depends on those colours and the terminal's colour mode.
- A changed row's background also colours the adjacent padding column.

## Strips

- A top strip shows the caller's header rows. With more than one hunk, its first row also shows the first hunk's position when both fit. Caller text takes priority over the position.
- A strip precedes each later hunk. It shows the hunk number and, when space permits, the start line.
- A bottom strip shows the compact notice, then the caller's footer rows.
