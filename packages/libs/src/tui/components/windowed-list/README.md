# Windowed lists

[Shared TUI](../../README.md#usage)

Long lists render faster when Pi only sees the visible window. [`renderWindowedList`](index.ts) uses Pi's `SelectList` to render a window centred on the selected item where possible.

This internal component has no package entry. The [browser](../browser/README.md) and [settings menu](../settings-menu/README.md) import it directly.

## Behaviour

- Display selection clamps without mutating caller state.
- Rows fit the requested width, including viewports narrower than Pi's selection marker.
- `format` receives only visible items.
- `format` can return custom Pi column options.
- The native list sees only the window, so it generates no full-collection counter.
- The result has the rendered `lines` and the window's `start` index and item `count`.

## Usage

```ts
import { renderWindowedList } from "../windowed-list/index.ts";

const { lines, start, count } = renderWindowedList({
  items,
  selectedIndex: selected,
  maxRows: 8,
  width,
  theme: selectListTheme,
  format: (visible) => ({
    items: visible.map((item) => ({ value: item.id, label: displayText(item.name) }))
  })
});
```

## Caller responsibilities

- Manage selection, input handling, search, page size, empty-state text, and collection-wide counters.
- Supply an integer selection index, a nonnegative safe-integer row limit, and a valid terminal width.
- Keep the count and order of the visible items in `format`.
- Format display-safe item text.
- Choose width-preserving styles.

Related: the [shared TUI validation](../../README.md#validation) lists the terminal scenarios for list presentation.
