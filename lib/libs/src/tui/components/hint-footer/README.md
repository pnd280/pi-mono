# Hint footers

[Shared TUI](../../README.md#usage)

## Behaviour

A footer must show available hints and transient feedback in a fixed height. [`renderHintFooter`](index.ts) returns rows fitted to the visible terminal width, up to `maxRows`.

Messages replace hints at the same height; message overflow replaces the final row with `overflowText`. Zero width or rows returns no rows. It sends no notifications and starts no timers; callers own feedback expiry and delivery.

## Caller responsibilities

- Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions.
- Select hints and row limits for the active actions and layout.
- Retain full messages separately from the bounded rows.

## Validation

See [package validation](../../../../README.md#validation) and prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
