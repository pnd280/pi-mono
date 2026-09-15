# Timed confirmation

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/timed-confirmation`](index.ts) exports `TimedConfirmation`. `confirm(target)` succeeds only when the same target is supplied twice before the deadline. Targets are compared with `===`.

The library retains the armed target and deadline and calls `expired` when its timer expires. It does not perform the confirmed action.

## Caller responsibilities

Supply the duration, clock, and expiry callback. Choose the action and confirmation messages in the consumer.

Cancel confirmation when selection, collection, or mounting context changes. Call `dispose()` when the owner closes.

## Validation

Use the [package validation commands](../../README.md#validation).
