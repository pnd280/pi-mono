# Hint footers

[Shared TUI](../../README.md#usage)

## Behaviour

A footer must show available hints and transient feedback in a fixed height. [`renderHintFooter`](index.ts) returns rows fitted to the visible terminal width, up to `maxRows`.

Messages replace hints at the same height. If a message overflows, `overflowText` replaces the final row. A width or row limit of zero returns no rows. It sends no notifications and starts no timers.

## Caller responsibilities

- Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions.
- Select hints and row limits for the active actions and layout.
- Retain full messages separately from the bounded rows.
- Own feedback expiry and delivery.

## Validation

See [package validation](../../../../README.md#validation) and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
