# Hint footers

[Shared TUI](../../README.md#usage)

## Behaviour

A footer must show available hints and transient feedback in a fixed height. [`renderHintFooter`](index.ts) returns rows fitted to the visible terminal width, up to `maxRows`.

Messages replace hints without changing height. Overflow replaces the final row with `overflowText`. Zero width or zero rows returns no rows.

## Caller responsibilities

- Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions.
- Select hints and row limits for the active actions and layout.
- Retain full messages separately from the bounded rows.
- The renderer sends no notifications and starts no timers; [expiring notices](../../../expiring-notice/README.md) defer and deduplicate delivery.

## Validation

See [package validation](../../../../README.md#validation), the [packing tests](index.test.ts), and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
