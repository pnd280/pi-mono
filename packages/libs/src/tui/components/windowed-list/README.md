# Windowed lists

[Shared TUI](../../README.md#usage)

This internal component has no package entry. The [browser](../browser/README.md) and [settings menu](../settings-menu/README.md) import it directly.

## Behaviour

Long lists render faster when Pi only sees the visible window. [`renderWindowedList`](index.ts) uses Pi's `SelectList` to render a window centred on the selected item where possible.

- Display selection clamps without mutating caller state.
- Rows fit the requested width, including viewports narrower than Pi's selection marker.
- `format` receives only visible items and must keep their count and order; custom Pi column options are allowed.
- The native list sees only the window, so no full-collection counter is generated.
- The result has the rendered `lines` and the window's `start` index and item `count`.

## Caller responsibilities

- Manage selection, input handling, search, page size, empty-state text, and collection-wide counters.
- Supply an integer selection index, a nonnegative safe-integer row limit, and a valid terminal width.
- Format display-safe item text and choose width-preserving styles.

## Validation

See [package validation](../../../../README.md#validation) and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
