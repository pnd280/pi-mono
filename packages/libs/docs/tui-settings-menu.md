# Settings menu layout

[Settings menu](../src/tui/components/settings-menu/README.md) · [Shared TUI](../src/tui/README.md)

This guide is for callers who choose settings items, groups, and hints for [`renderSettingsMenu`](../src/tui/components/settings-menu/index.ts), or who check its rendered output at small sizes.

## Lists and overflow

- Overflowing lists show `(selected/total)` below the last visible item, not in the border.
- Border overflow labels are only for prose previews.
- The list budgets group gaps only within the visible window. Hidden groups do not reduce the number of visible items.

## Small terminals

- At 40×10, selection, save and exit controls, and inline recovery take priority over paths and secondary draft context.
- Below that size, resize if controls or recovery no longer fit.
