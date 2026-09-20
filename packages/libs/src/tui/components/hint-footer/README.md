# Hint footers

[Shared TUI](../../README.md#usage)

## Behavior

[`renderHintFooter`](index.ts), exported from `@pi-mono/libs/tui/components/hint-footer`, fits hints to the visible terminal width, up to `maxRows`.

Messages replace hints without changing height. Overflow sets `messageOverflow` and replaces the final row with `overflowText`; nonempty messages also overflow at zero rows.

## Caller responsibilities

Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions. Select hints and row limits for the active actions and layout.

Retain full messages; notify overflow outside rendering. The renderer sends no notifications/timers; [expiring notices](../../../expiring-notice/README.md) defer/deduplicate delivery.

## Validation

See [package validation](../../../../README.md#validation), the [packing tests](index.test.ts), and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
