# Hint footers

[Shared TUI](../../README.md#usage)

## Behavior

[`renderHintFooter`](index.ts), exported from `@pi-mono/libs/tui/components/hint-footer`, fits hints to the visible terminal width, up to `maxRows`. Callers supply padding, a separator, and styling.

An optional message replaces the hint rows without changing the footer height. If the message does not fit, the final row uses `overflowText` and the result sets `messageOverflow`. A nonempty message still reports overflow when no rows are available.

## Caller responsibilities

Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions. Select hints and row limits for the active actions and layout.

Retain the complete message and deliver overflow notifications outside rendering. The renderer neither sends notifications nor schedules timers. The shared [expiring notice](../../../expiring-notice/README.md) can defer delivery and suppress duplicates.

## Validation

See [package validation](../../../../README.md#validation), the [packing tests](index.test.ts), and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
