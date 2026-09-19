# Responsive custom UI

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/responsive-custom-ui`](index.ts) exports `openResponsiveCustomUI`, which preserves one logical component across inline and overlay remounts.

The helper calls the component's optional `dispose()` at final closure, not during a remount.

## Caller responsibilities

Supply a UI object with `custom`, a component factory, a cancellation signal, sizing, and transition policy. Use `onTransition` for actions such as cancelling a [timed confirmation](../../timed-confirmation/README.md) when the mounting context changes.

Await the returned promise before applying editor changes. Pi restores the opening editor snapshot when inline UI closes. The [browser host](../open-browser/README.md) provides an `afterClose` callback and requests redraws after editor changes.

## Validation

Use the [package validation commands](../../../README.md#validation), the [browser host tests](../open-browser/index.test.ts), and the [responsive mounting scenarios](../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
