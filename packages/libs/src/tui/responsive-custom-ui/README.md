# Responsive custom UI

[Shared TUI](../README.md#usage)

## Behavior

[`openResponsiveCustomUI`](index.ts) (`@pi-mono/libs/tui/responsive-custom-ui`) preserves one component across inline/overlay remounts, calling optional `dispose()` only at final closure.

## Caller responsibilities

Supply a UI object with `custom`, a component factory, a cancellation signal, sizing, and transition policy. Use `onTransition` for actions such as cancelling a [timed confirmation](../../timed-confirmation/README.md) when the mounting context changes.

Await closure before editor changes: Pi restores the opening snapshot on inline closure. The [browser host](../open-browser/README.md) provides `afterClose` and redraws.

## Validation

Use the [package validation commands](../../../README.md#validation), the [browser host tests](../open-browser/index.test.ts), and the [responsive mounting scenarios](../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
