# Windowed lists

[Shared TUI](../../README.md#usage)

## Behavior

[`renderWindowedList`](index.ts), exported from `@pi-mono/libs/tui/components/windowed-list`, uses Pi's `SelectList` to render a window centered on the selected item where possible. It returns rendered lines, the starting index, and the visible item count.

For display, selection is clamped to the item range without changing caller state. An empty collection or zero-size viewport produces no lines.

Only visible items reach the `format` callback. It must preserve item count and order and may return Pi layout options for custom columns. The native list receives only that window, so it does not generate a counter for the complete collection.

## Caller responsibilities

Manage selection, input handling, search, page size, empty-state text, and collection-wide counters. Supply an integer selection index, a nonnegative safe-integer row limit, and a valid terminal width.

Format display-safe item text and choose width-preserving styles.

## Validation

See [package validation](../../../../README.md#validation), the [window tests](index.test.ts), and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
